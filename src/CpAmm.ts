import { Program, BN } from "@coral-xyz/anchor";
import {
  getAssociatedTokenAddressSync,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import invariant from "invariant";
import Decimal from "decimal.js";

import { CpAmm as CpmmIdl, IDL } from "./idl";
import {
  Connection,
  Transaction,
  PublicKey,
  Keypair,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  CP_AMM_PROGRAM_ID,
  MAX_FEE_NUMERATOR,
  MAX_SQRT_PRICE,
  MIN_SQRT_PRICE,
} from "./constants";
import {
  AddLiquidityParams,
  AmmProgram,
  ClaimPartnerFeeParams,
  ClaimPositionFeeParams,
  ClaimRewardParams,
  ConfigState,
  CreatePoolParams,
  CreatePositionParams,
  FundRewardParams,
  GetQuoteParams,
  InitializeCustomizeablePoolParams,
  InitializeRewardParams,
  LockPositionParams,
  PermanentLockParams,
  PoolState,
  PositionState,
  RefreshVestingParams,
  RemoveLiquidityParams,
  TxBuilder,
  UpdateRewardDurationParams,
  UpdateRewardFunderParams,
  WithdrawIneligibleRewardParams,
} from "./types";
import {
  deriveCustomizablePoolAddress,
  derivePoolAddress,
  derivePoolAuthority,
  derivePositionAddress,
  derivePositionNftAccount,
  deriveRewardVaultAddress,
  deriveTokenVaultAddress,
} from "./pda";
import { decimalToQ64, priceToSqrtPrice } from "./math";

import {
  calculateFee,
  getBaseFeeNumerator,
  getDynamicFeeNumerator,
  getOrCreateATAInstruction,
  getTokenDecimals,
  getTokenProgram,
  unwrapSOLInstruction,
  wrapSOLInstruction,
} from "./utils";
import { calculateSwap } from "./utils/curve";

export class CpAmm {
  _program: AmmProgram;
  constructor(connection: Connection, programId?: PublicKey) {
    this._program = new Program<CpmmIdl>(IDL, programId ?? CP_AMM_PROGRAM_ID, {
      connection: connection,
    });
  }

  /**
    Prepares token ordering, calculates the initial sqrtPrice in Q64 format,
    and converts the provided liquidity to Q64 format for internal usage.
    * initialPrice = tokenX/tokenY
    * initPrice = tokenB/tokenA
    * will invert the price with correct token order
    @private
    @async
    @param {PublicKey} tokenX - One token mint address in the pair.
    @param {PublicKey} tokenY - The other token mint address in the pair.
    @param {Decimal} initialPrice - The initial price ratio of tokenX/tokenY (will be inverted if needed).
    @param {Decimal} liquidity - The initial liquidity value.
    @returns {Promise<{
    tokenAMint: PublicKey,
    tokenBMint: PublicKey,
    sqrtPriceQ64: BN,
    liquidityQ64: BN
    }>} Object containing the ordered token mints and their Q64 price/liquidity values. 
  */
  private async preparePoolCreationParams(
    tokenX: PublicKey,
    tokenY: PublicKey,
    initialPrice: Decimal,
    liquidity: Decimal
  ): Promise<{
    tokenAMint: PublicKey;
    tokenBMint: PublicKey;
    sqrtPriceQ64: BN;
    liquidityQ64: BN;
  }> {
    const [tokenAMint, tokenBMint, initPrice] = new BN(tokenX.toBuffer()).gt(
      new BN(tokenY.toBuffer())
    )
      ? [tokenY, tokenX, new Decimal(1).div(initialPrice)]
      : [tokenX, tokenY, initialPrice];

    const tokenADecimal = await getTokenDecimals(
      this._program.provider.connection,
      tokenAMint
    );

    const tokenBDecimal = await getTokenDecimals(
      this._program.provider.connection,
      tokenBMint
    );

    const sqrtPriceQ64 = priceToSqrtPrice(
      new Decimal(initPrice),
      tokenADecimal,
      tokenBDecimal
    );
    const liquidityQ64 = decimalToQ64(liquidity);

    return { tokenAMint, tokenBMint, sqrtPriceQ64, liquidityQ64 };
  }

  /**
    Builds a transaction with the provided instructions, setting the blockhash
    and last valid block height under the hood.
    @private
    @async
    @param {PublicKey} feePayer - The public key responsible for paying transaction fees.
    @param {TransactionInstruction[]} instructions - Array of transaction instructions to include.
    @returns {TxBuilder} A Solana Transaction object with the instructions attached. 
  */

  private async buildTransaction(
    feePayer: PublicKey,
    instructions: TransactionInstruction[]
  ): TxBuilder {
    const { blockhash, lastValidBlockHeight } =
      await this._program.provider.connection.getLatestBlockhash("confirmed");

    return new Transaction({
      blockhash,
      lastValidBlockHeight,
      feePayer,
    }).add(...instructions);
  }

  // fetcher
  async fetchConfigState(config: PublicKey): Promise<ConfigState> {
    const configState = await this._program.account.config.fetchNullable(
      config
    );
    invariant(configState, `Config account: ${config} not found`);

    return configState;
  }

  async fetchPoolState(pool: PublicKey): Promise<PoolState> {
    const poolState = await this._program.account.pool.fetchNullable(pool);
    invariant(poolState, `Pool account: ${pool} not found`);

    return poolState;
  }

  async fetchPositionState(position: PublicKey): Promise<PositionState> {
    const positionState = await this._program.account.position.fetchNullable(
      position
    );
    invariant(positionState, `Position account: ${position} not found`);

    return positionState;
  }

  async getQuote(
    params: GetQuoteParams
  ): Promise<{ actualAmount: BN; totalFee: BN }> {
    const { pool, inAmount, inputTokenMint } = params;
    const poolState = await this.fetchPoolState(pool);
    const {
      sqrtPrice: sqrtPriceQ64,
      liquidity: liquidityQ64,
      activationType,
      activationPoint,
      poolFees,
    } = poolState;

    const {
      feeSchedulerMode,
      cliffFeeNumerator,
      numberOfPeriod,
      reductionFactor,
      dynamicFee,
      periodFrequency,
    } = poolFees;

    const aToB = poolState.tokenAMint.equals(inputTokenMint);

    const outAmount = calculateSwap(inAmount, sqrtPriceQ64, liquidityQ64, aToB);

    const currentPoint = activationType
      ? Math.floor(Date.now() / 1000) // reduce RPC call
      : await this._program.provider.connection.getSlot();

    const period = new BN(currentPoint).lt(activationPoint)
      ? numberOfPeriod
      : BN.min(
          numberOfPeriod,
          new BN(currentPoint).sub(activationPoint).div(periodFrequency)
        );

    let feeNumerator = getBaseFeeNumerator(
      feeSchedulerMode,
      cliffFeeNumerator,
      period,
      reductionFactor
    );

    if (dynamicFee.initialize != 0) {
      const { volatilityAccumulator, binStep, variableFeeControl } = dynamicFee;
      const dynamicFeeNumberator = getDynamicFeeNumerator(
        volatilityAccumulator,
        binStep,
        variableFeeControl
      );
      feeNumerator.add(dynamicFeeNumberator);
    }

    const tradeFeeNumerator = feeNumerator.gt(MAX_FEE_NUMERATOR)
      ? MAX_FEE_NUMERATOR
      : feeNumerator;

    const { actualAmount, lpFee } = calculateFee(outAmount, tradeFeeNumerator);

    return {
      actualAmount,
      totalFee: lpFee,
    };
  }

  async getLiquidityDelta(params: any): Promise<any> {
    // TODO
  }

  async createPool(params: CreatePoolParams): TxBuilder {
    let {
      payer,
      creator,
      config,
      tokenX,
      tokenY,
      activationPoint,
      initialPrice, //
      liquidity,
    } = params;

    const { tokenAMint, tokenBMint, sqrtPriceQ64, liquidityQ64 } =
      await this.preparePoolCreationParams(
        tokenX,
        tokenY,
        new Decimal(initialPrice),
        new Decimal(liquidity)
      );

    const poolAuthority = derivePoolAuthority();
    const pool = derivePoolAddress(config, tokenX, tokenY);

    const tokenAVault = deriveTokenVaultAddress(tokenAMint, pool);
    const tokenBVault = deriveTokenVaultAddress(tokenBMint, pool);

    const positionNft = Keypair.generate();
    const position = derivePositionAddress(positionNft.publicKey);
    const positionNftAccount = derivePositionNftAccount(positionNft.publicKey);

    const tokenAProgram = (
      await this._program.provider.connection.getParsedAccountInfo(tokenAMint)
    )?.value?.owner;

    const tokenBProgram = (
      await this._program.provider.connection.getParsedAccountInfo(tokenBMint)
    )?.value?.owner;

    const payerTokenA = getAssociatedTokenAddressSync(
      tokenAMint,
      payer,
      true,
      tokenAProgram
    );
    const payerTokenB = getAssociatedTokenAddressSync(
      tokenBMint,
      payer,
      true,
      tokenBProgram
    );

    const instructions = await this._program.methods
      .initializePool({
        liquidity: liquidityQ64,
        sqrtPrice: sqrtPriceQ64,
        activationPoint: activationPoint,
      })
      .accounts({
        creator,
        positionNftAccount,
        positionNftMint: positionNft.publicKey,
        payer: payer,
        config,
        poolAuthority,
        pool,
        position,
        tokenAMint,
        tokenBMint,
        tokenAVault,
        tokenBVault,
        payerTokenA,
        payerTokenB,
        token2022Program: TOKEN_2022_PROGRAM_ID,

        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = await this.buildTransaction(payer, [instructions]);
    tx.partialSign(positionNft);

    return tx;
  }

  async createCustomizePool(
    params: InitializeCustomizeablePoolParams
  ): TxBuilder {
    const {
      tokenX,
      tokenY,
      payer,
      creator,
      poolFees,
      hasAlphaVault,
      liquidity,
      initialPrice,
      collectFeeMode,
      activationPoint,
      activationType,
    } = params;

    const { tokenAMint, tokenBMint, sqrtPriceQ64, liquidityQ64 } =
      await this.preparePoolCreationParams(
        tokenX,
        tokenY,
        new Decimal(initialPrice),
        new Decimal(liquidity)
      );

    const poolAuthority = derivePoolAuthority();
    const pool = deriveCustomizablePoolAddress(tokenAMint, tokenBMint);

    const positionNft = Keypair.generate();
    const position = derivePositionAddress(positionNft.publicKey);
    const positionNftAccount = derivePositionNftAccount(positionNft.publicKey);

    const tokenAProgram = (
      await this._program.provider.connection.getParsedAccountInfo(tokenAMint)
    )?.value?.owner;

    const tokenBProgram = (
      await this._program.provider.connection.getParsedAccountInfo(tokenBMint)
    )?.value?.owner;

    const tokenAVault = deriveTokenVaultAddress(tokenAMint, pool);
    const tokenBVault = deriveTokenVaultAddress(tokenBMint, pool);

    const payerTokenA = getAssociatedTokenAddressSync(
      tokenAMint,
      payer,
      true,
      tokenAProgram
    );
    const payerTokenB = getAssociatedTokenAddressSync(
      tokenBMint,
      payer,
      true,
      tokenBProgram
    );

    const instructions = await this._program.methods
      .initializeCustomizablePool({
        poolFees,
        sqrtMinPrice: MIN_SQRT_PRICE,
        sqrtMaxPrice: MAX_SQRT_PRICE,
        hasAlphaVault,
        liquidity: liquidityQ64,
        sqrtPrice: sqrtPriceQ64,
        activationType,
        collectFeeMode,
        activationPoint,
      })
      .accounts({
        creator,
        positionNftAccount,
        positionNftMint: positionNft.publicKey,
        payer: payer,
        poolAuthority,
        pool,
        position,
        tokenAMint,
        tokenBMint,
        tokenAVault,
        tokenBVault,
        payerTokenA,
        payerTokenB,
        token2022Program: TOKEN_2022_PROGRAM_ID,
        tokenAProgram,
        tokenBProgram,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = await this.buildTransaction(payer, [instructions]);

    tx.partialSign(positionNft);

    return tx;
  }

  async createPosition(params: CreatePositionParams): TxBuilder {
    const { owner, payer, pool } = params;
    const poolAuthority = derivePoolAuthority();

    const positionNft = Keypair.generate();
    const position = derivePositionAddress(positionNft.publicKey);
    const positionNftAccount = derivePositionNftAccount(positionNft.publicKey);

    const instructions = await this._program.methods
      .createPosition()
      .accounts({
        owner,
        positionNftMint: positionNft.publicKey,
        poolAuthority,
        positionNftAccount,
        payer: payer,
        pool,
        position,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = await this.buildTransaction(payer, [instructions]);

    tx.partialSign(positionNft);

    return tx;
  }

  async addLiquidity(params: AddLiquidityParams): TxBuilder {
    const {
      owner,
      position,
      liquidityDelta,
      tokenAAmountThreshold,
      tokenBAmountThreshold,
    } = params;
    const liquidityDeltaQ64 = decimalToQ64(new Decimal(liquidityDelta));

    const positionState = await this.fetchPositionState(position);
    const poolState = await this.fetchPoolState(positionState.pool);
    const positionNftAccount = derivePositionNftAccount(positionState.nftMint);

    const tokenAProgram = getTokenProgram(poolState.tokenAFlag);
    const tokenBProgram = getTokenProgram(poolState.tokenBFlag);

    const tokenAAccount = getAssociatedTokenAddressSync(
      poolState.tokenAMint,
      owner,
      true,
      tokenAProgram
    );
    const tokenBAccount = getAssociatedTokenAddressSync(
      poolState.tokenBMint,
      owner,
      true,
      tokenBProgram
    );

    //TODO handle warp sol

    const instructions = await this._program.methods
      .addLiquidity({
        liquidityDelta: liquidityDeltaQ64,
        tokenAAmountThreshold,
        tokenBAmountThreshold,
      })
      .accounts({
        pool: positionState.pool,
        position,
        positionNftAccount,
        owner: owner,
        tokenAAccount,
        tokenBAccount,
        tokenAMint: poolState.tokenAMint,
        tokenBMint: poolState.tokenBMint,
        tokenAVault: poolState.tokenAVault,
        tokenBVault: poolState.tokenBVault,
        tokenAProgram,
        tokenBProgram,
      })
      .instruction();

    return await this.buildTransaction(owner, [instructions]);
  }

  async removeLiquidity(params: RemoveLiquidityParams): TxBuilder {
    const {
      owner,
      position,
      liquidityDelta,
      tokenAAmountThreshold,
      tokenBAmountThreshold,
    } = params;
    const liquidityDeltaQ64 = decimalToQ64(new Decimal(liquidityDelta));
    const positionState = await this.fetchPositionState(position);
    const poolState = await this.fetchPoolState(positionState.pool);
    const positionNftAccount = derivePositionNftAccount(positionState.nftMint);

    const poolAuthority = derivePoolAuthority();
    const tokenAProgram = getTokenProgram(poolState.tokenAFlag);
    const tokenBProgram = getTokenProgram(poolState.tokenBFlag);

    const preInstructions: TransactionInstruction[] = [];
    const [
      { ataPubkey: tokenAAccount, ix: createTokenAAccountIx },
      { ataPubkey: tokenBAccount, ix: createTokenBAccountIx },
    ] = await Promise.all([
      getOrCreateATAInstruction(
        this._program.provider.connection,
        poolState.tokenAMint,
        owner,
        owner,
        true,
        tokenAProgram
      ),
      getOrCreateATAInstruction(
        this._program.provider.connection,
        poolState.tokenBMint,
        owner,
        owner,
        true,
        tokenBProgram
      ),
    ]);
    createTokenAAccountIx && preInstructions.push(createTokenAAccountIx);
    createTokenBAccountIx && preInstructions.push(createTokenBAccountIx);

    const postInstructions: TransactionInstruction[] = [];
    if (
      [
        poolState.tokenAMint.toBase58(),
        poolState.tokenBMint.toBase58(),
      ].includes(NATIVE_MINT.toBase58())
    ) {
      const closeWrappedSOLIx = await unwrapSOLInstruction(owner);
      closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
    }

    const instructions = await this._program.methods
      .removeLiquidity({
        maxLiquidityDelta: liquidityDeltaQ64,
        tokenAAmountThreshold,
        tokenBAmountThreshold,
      })
      .accounts({
        poolAuthority,
        pool: positionState.pool,
        position,
        positionNftAccount,
        owner: owner,
        tokenAAccount,
        tokenBAccount,
        tokenAMint: poolState.tokenAMint,
        tokenBMint: poolState.tokenBMint,
        tokenAVault: poolState.tokenAVault,
        tokenBVault: poolState.tokenBVault,
        tokenAProgram,
        tokenBProgram,
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .instruction();

    return await this.buildTransaction(owner, [instructions]);
  }

  async swap(params: any): TxBuilder {
    const {
      payer,
      pool,
      inputTokenMint,
      outputTokenMint,
      amountIn,
      minimumAmountOut,
      referralTokenAccount,
    } = params;

    const poolState = await this.fetchPoolState(pool);
    const poolAuthority = derivePoolAuthority();

    const tokenAProgram = getTokenProgram(poolState.tokenAFlag);
    const tokenBProgram = getTokenProgram(poolState.tokenBFlag);

    const preInstructions: TransactionInstruction[] = [];
    const [
      { ataPubkey: inputTokenAccount, ix: createInputTokenAccountIx },
      { ataPubkey: outputTokenAccount, ix: createOutputTokenAccountIx },
    ] = await Promise.all([
      getOrCreateATAInstruction(
        this._program.provider.connection,
        inputTokenMint,
        payer,
        payer,
        true,
        tokenAProgram
      ),
      getOrCreateATAInstruction(
        this._program.provider.connection,
        outputTokenMint,
        payer,
        payer,
        true,
        tokenBProgram
      ),
    ]);
    createInputTokenAccountIx &&
      preInstructions.push(createInputTokenAccountIx);
    createOutputTokenAccountIx &&
      preInstructions.push(createOutputTokenAccountIx);

    if (inputTokenMint.equals(NATIVE_MINT)) {
      const wrapSOLIx = wrapSOLInstruction(
        payer,
        inputTokenAccount,
        BigInt(amountIn.toString())
      );

      preInstructions.push(...wrapSOLIx);
    }

    const postInstructions: TransactionInstruction[] = [];
    if (outputTokenMint.equals(NATIVE_MINT)) {
      const closeWrappedSOLIx = await unwrapSOLInstruction(payer);
      closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
    }

    const instructions = await this._program.methods
      .swap({
        amountIn,
        minimumAmountOut,
      })
      .accounts({
        poolAuthority,
        pool,
        payer: payer,
        inputTokenAccount,
        outputTokenAccount,
        tokenAVault: poolState.tokenAVault,
        tokenBVault: poolState.tokenBVault,
        tokenAMint: poolState.tokenAMint,
        tokenBMint: poolState.tokenBMint,
        tokenAProgram,
        tokenBProgram,
        referralTokenAccount,
      })
      .postInstructions(postInstructions)
      .instruction();

    return await this.buildTransaction(payer, [instructions]);
  }

  async lockPosition(params: LockPositionParams): TxBuilder {
    const { owner, payer, position } = params;
    const positionState = await this.fetchPositionState(position);
    const positionNftAccount = derivePositionNftAccount(positionState.nftMint);

    const vestingAccount = Keypair.generate();

    const instructions = await this._program.methods
      .lockPosition(params)
      .accounts({
        position,
        positionNftAccount,
        vesting: vestingAccount.publicKey,
        pool: positionState.pool,
        owner: owner,
        payer: payer,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    const tx = await this.buildTransaction(owner, [instructions]);

    tx.partialSign(vestingAccount);

    return tx;
  }

  async permanentLockPosition(params: PermanentLockParams): TxBuilder {
    const { owner, position } = params;
    const positionState = await this.fetchPositionState(position);
    const positionNftAccount = derivePositionNftAccount(positionState.nftMint);

    const instructions = await this._program.methods
      .permanentLockPosition(positionState.unlockedLiquidity)
      .accounts({
        position,
        positionNftAccount,
        pool: positionState.pool,
        owner: owner,
      })
      .instruction();

    return await this.buildTransaction(owner, [instructions]);
  }

  async refreshVesting(params: RefreshVestingParams): TxBuilder {
    const { owner, position, vestings } = params;

    const positionState = await this.fetchPositionState(position);
    const positionNftAccount = derivePositionNftAccount(positionState.nftMint);

    const instructions = await this._program.methods
      .refreshVesting()
      .accounts({
        position,
        positionNftAccount,
        pool: positionState.pool,
        owner,
      })
      .remainingAccounts(
        vestings.map((pubkey: PublicKey) => {
          return {
            isSigner: false,
            isWritable: true,
            pubkey,
          };
        })
      )
      .instruction();

    return await this.buildTransaction(owner, [instructions]);
  }

  async claimPositionFee(params: ClaimPositionFeeParams): TxBuilder {
    const { owner, position } = params;

    const positionState = await this.fetchPositionState(position);

    const poolState = await this.fetchPoolState(positionState.pool);

    const positionNftAccount = derivePositionNftAccount(positionState.nftMint);

    const poolAuthority = derivePoolAuthority();

    const tokenAProgram = getTokenProgram(poolState.tokenAFlag);
    const tokenBProgram = getTokenProgram(poolState.tokenBFlag);

    const preInstructions: TransactionInstruction[] = [];
    const [
      { ataPubkey: tokenAAccount, ix: createTokenAAccountIx },
      { ataPubkey: tokenBAccount, ix: createTokenBAccountIx },
    ] = await Promise.all([
      getOrCreateATAInstruction(
        this._program.provider.connection,
        poolState.tokenAMint,
        owner,
        owner,
        true,
        tokenAProgram
      ),
      getOrCreateATAInstruction(
        this._program.provider.connection,
        poolState.tokenBMint,
        owner,
        owner,
        true,
        tokenBProgram
      ),
    ]);
    createTokenAAccountIx && preInstructions.push(createTokenAAccountIx);
    createTokenBAccountIx && preInstructions.push(createTokenBAccountIx);

    const postInstructions: TransactionInstruction[] = [];
    if (
      [
        poolState.tokenAMint.toBase58(),
        poolState.tokenBMint.toBase58(),
      ].includes(NATIVE_MINT.toBase58())
    ) {
      const closeWrappedSOLIx = await unwrapSOLInstruction(owner);
      closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
    }

    const instructions = await this._program.methods
      .claimPositionFee()
      .accounts({
        poolAuthority,
        owner: owner,
        pool: positionState.pool,
        position,
        positionNftAccount,
        tokenAAccount,
        tokenBAccount,
        tokenAVault: poolState.tokenAVault,
        tokenBVault: poolState.tokenBVault,
        tokenAMint: poolState.tokenAMint,
        tokenBMint: poolState.tokenBMint,
        tokenAProgram,
        tokenBProgram,
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .instruction();

    return await this.buildTransaction(owner, [instructions]);
  }

  async initializeReward(params: InitializeRewardParams): TxBuilder {
    const { rewardIndex, rewardDuration, pool, rewardMint, payer } = params;

    const poolAuthority = derivePoolAuthority();
    const rewardVault = deriveRewardVaultAddress(pool, rewardIndex);

    const tokenProgram = (
      await this._program.provider.connection.getParsedAccountInfo(rewardMint)
    )?.value?.owner;

    const instruction = await this._program.methods
      .initializeReward(rewardIndex, rewardDuration, payer)
      .accounts({
        pool,
        poolAuthority,
        rewardVault,
        rewardMint,
        admin: payer,
        tokenProgram,
        systemProgram: SystemProgram.programId,
      })
      .instruction();
    return await this.buildTransaction(payer, [instruction]);
  }

  async updateRewardDuration(params: UpdateRewardDurationParams): TxBuilder {
    const { pool, admin, rewardIndex, newDuration } = params;
    const instruction = await this._program.methods
      .updateRewardDuration(rewardIndex, newDuration)
      .accounts({
        pool,
        admin: admin,
      })
      .instruction();

    return await this.buildTransaction(admin, [instruction]);
  }

  async updateRewardFunder(params: UpdateRewardFunderParams): TxBuilder {
    const { pool, admin, rewardIndex, newFunder } = params;
    const instruction = await this._program.methods
      .updateRewardFunder(rewardIndex, newFunder)
      .accounts({
        pool,
        admin: admin,
      })
      .instruction();

    return await this.buildTransaction(admin, [instruction]);
  }

  async fundReward(params: FundRewardParams): TxBuilder {
    const { rewardIndex, carryForward, pool, funder, amount } = params;

    const poolState = await this.fetchPoolState(pool);
    const rewardInfo = poolState.rewardInfos[rewardIndex];
    const { vault, mint, rewardTokenFlag } = rewardInfo;
    const tokenProgram = getTokenProgram(rewardIndex);

    const preInstructions: TransactionInstruction[] = [];

    const { ataPubkey: funderTokenAccount, ix: createFunderTokenAccountIx } =
      await getOrCreateATAInstruction(
        this._program.provider.connection,
        mint,
        funder,
        funder,
        true,
        tokenProgram
      );

    createFunderTokenAccountIx &&
      preInstructions.push(createFunderTokenAccountIx);

    // TODO: check case reward mint is wSOL && carryForward is true => total amount > amount
    if (mint.equals(NATIVE_MINT) && !amount.isZero()) {
      const wrapSOLIx = wrapSOLInstruction(
        funder,
        funderTokenAccount,
        BigInt(amount.toString())
      );

      preInstructions.push(...wrapSOLIx);
    }

    const instruction = await this._program.methods
      .fundReward(rewardIndex, amount, carryForward)
      .accounts({
        pool,
        rewardVault: vault,
        rewardMint: mint,
        funderTokenAccount,
        funder: funder,
        tokenProgram,
      })
      .instruction();

    return await this.buildTransaction(funder, [instruction]);
  }

  async withdrawIneligibleReward(
    params: WithdrawIneligibleRewardParams
  ): TxBuilder {
    const { rewardIndex, pool, funder } = params;

    const poolState = await this.fetchPoolState(pool);
    const poolAuthority = derivePoolAuthority();

    const rewardInfo = poolState.rewardInfos[rewardIndex];
    const { mint, vault, rewardTokenFlag } = rewardInfo;
    const tokenProgram = getTokenProgram(rewardTokenFlag);

    const preInstructions: TransactionInstruction[] = [];
    const postInstructions: TransactionInstruction[] = [];
    const { ataPubkey: funderTokenAccount, ix: createFunderTokenAccountIx } =
      await getOrCreateATAInstruction(
        this._program.provider.connection,
        mint,
        funder,
        funder,
        true,
        tokenProgram
      );
    createFunderTokenAccountIx &&
      preInstructions.push(createFunderTokenAccountIx);

    if (mint.equals(NATIVE_MINT)) {
      const closeWrappedSOLIx = await unwrapSOLInstruction(funder);
      closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
    }

    const instruction = await this._program.methods
      .withdrawIneligibleReward(rewardIndex)
      .accounts({
        pool,
        rewardVault: vault,
        rewardMint: mint,
        poolAuthority,
        funderTokenAccount,
        funder: funder,
        tokenProgram,
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .instruction();

    return await this.buildTransaction(funder, [instruction]);
  }

  async claimPartnerFee(params: ClaimPartnerFeeParams): TxBuilder {
    const { partner, pool, maxAmountA, maxAmountB } = params;
    const poolState = await this.fetchPoolState(pool);
    const poolAuthority = derivePoolAuthority();
    const {
      tokenAMint,
      tokenBMint,
      tokenAVault,
      tokenBVault,
      tokenAFlag,
      tokenBFlag,
    } = poolState;

    const tokenAProgram = getTokenProgram(tokenAFlag);
    const tokenBProgram = getTokenProgram(tokenBFlag);

    const preInstructions: TransactionInstruction[] = [];
    const [
      { ataPubkey: tokenAAccount, ix: createTokenAAccountIx },
      { ataPubkey: tokenBAccount, ix: createTokenBAccountIx },
    ] = await Promise.all([
      getOrCreateATAInstruction(
        this._program.provider.connection,
        poolState.tokenAMint,
        partner,
        partner,
        true,
        tokenAProgram
      ),
      getOrCreateATAInstruction(
        this._program.provider.connection,
        poolState.tokenBMint,
        partner,
        partner,
        true,
        tokenBProgram
      ),
    ]);
    createTokenAAccountIx && preInstructions.push(createTokenAAccountIx);
    createTokenBAccountIx && preInstructions.push(createTokenBAccountIx);

    const postInstructions: TransactionInstruction[] = [];
    if (
      [
        poolState.tokenAMint.toBase58(),
        poolState.tokenBMint.toBase58(),
      ].includes(NATIVE_MINT.toBase58())
    ) {
      const closeWrappedSOLIx = await unwrapSOLInstruction(partner);
      closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
    }

    const instruction = await this._program.methods
      .claimPartnerFee(maxAmountA, maxAmountB)
      .accounts({
        poolAuthority,
        pool,
        tokenAAccount,
        tokenBAccount,
        tokenAVault,
        tokenBVault,
        tokenAMint,
        tokenBMint,
        partner,
        tokenAProgram,
        tokenBProgram,
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .instruction();

    return await this.buildTransaction(partner, [instruction]);
  }

  async claimReward(params: ClaimRewardParams): TxBuilder {
    const { user, position, rewardIndex } = params;
    const poolAuthority = derivePoolAuthority();

    const positionState = await this.fetchPositionState(position);
    const poolState = await this.fetchPoolState(positionState.pool);

    const positionNftAccount = derivePositionNftAccount(positionState!.nftMint);

    const rewardInfo = poolState.rewardInfos[rewardIndex];
    const tokenProgram = getTokenProgram(rewardInfo.rewardTokenFlag);

    const preInstructions: TransactionInstruction[] = [];
    const postInstructions: TransactionInstruction[] = [];
    const { ataPubkey: userTokenAccount, ix: createUserTokenAccountIx } =
      await getOrCreateATAInstruction(
        this._program.provider.connection,
        rewardInfo.mint,
        user,
        user,
        true,
        tokenProgram
      );
    createUserTokenAccountIx && preInstructions.push(createUserTokenAccountIx);

    if (rewardInfo.mint.equals(NATIVE_MINT)) {
      const closeWrappedSOLIx = await unwrapSOLInstruction(user);
      closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
    }
    const instructions = await this._program.methods
      .claimReward(rewardIndex)
      .accounts({
        pool: positionState.pool,
        positionNftAccount,
        rewardVault: rewardInfo.vault,
        rewardMint: rewardInfo.mint,
        poolAuthority,
        position,
        userTokenAccount,
        owner: user,
        tokenProgram,
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .instruction();

    return await this.buildTransaction(user, [instructions]);
  }
}
