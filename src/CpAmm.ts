import { Program, BN } from "@coral-xyz/anchor";
import { NATIVE_MINT, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import invariant from "invariant";

import CpAmmIDL from "./idl/cp_amm.json";
import type { CpAmm as CpAmmTypes } from "./idl/cp_amm";
import {
  Connection,
  Transaction,
  PublicKey,
  TransactionInstruction,
  SystemProgram,
  AccountMeta,
} from "@solana/web3.js";
import {
  AddLiquidityParams,
  AmmProgram,
  BuildAddLiquidityParams,
  BuildLiquidatePositionInstructionParams,
  BuildRemoveAllLiquidityInstructionParams,
  ClaimPartnerFeeParams,
  ClaimPositionFeeInstructionParams,
  ClaimPositionFeeParams,
  ClaimRewardParams,
  ClosePositionInstructionParams,
  ClosePositionParams,
  ConfigState,
  CreatePoolParams,
  CreatePositionAndAddLiquidity,
  CreatePositionParams,
  DepositQuote,
  DynamicFeeParams,
  FundRewardParams,
  GetDepositQuoteParams,
  GetQuoteParams,
  GetWithdrawQuoteParams,
  InitializeCustomizeablePoolParams,
  InitializeCustomizeablePoolWithDynamicConfigParams,
  LiquidityDeltaParams,
  LockPositionParams,
  MergePositionParams,
  PermanentLockParams,
  PoolState,
  PositionState,
  PrepareCustomizablePoolParams,
  PreparedPoolCreation,
  PreparePoolCreationParams,
  PreparePoolCreationSingleSide,
  PrepareTokenAccountParams,
  RefreshVestingParams,
  RemoveAllLiquidityAndClosePositionParams,
  RemoveAllLiquidityParams,
  RemoveLiquidityParams,
  Rounding,
  SetupFeeClaimAccountsParams,
  SwapParams,
  TxBuilder,
  UpdateRewardDurationParams,
  UpdateRewardFunderParams,
  VestingState,
  WithdrawIneligibleRewardParams,
  WithdrawQuote,
} from "./types";
import {
  deriveCustomizablePoolAddress,
  derivePoolAddress,
  derivePoolAuthority,
  derivePositionAddress,
  derivePositionNftAccount,
  deriveTokenBadgeAddress,
  deriveTokenVaultAddress,
} from "./pda";

import {
  getFeeNumerator,
  getOrCreateATAInstruction,
  getTokenProgram,
  unwrapSOLInstruction,
  wrapSOLInstruction,
  getSwapAmount,
  getLiquidityDeltaFromAmountA,
  getLiquidityDeltaFromAmountB,
  getMinAmountWithSlippage,
  getPriceImpact,
  positionByPoolFilter,
  vestingByPositionFilter,
  calculateInitSqrtPrice,
  calculateTransferFeeExcludedAmount,
  calculateTransferFeeIncludedAmount,
  getAmountBFromLiquidityDelta,
  getAmountAFromLiquidityDelta,
  getAvailableVestingLiquidity,
  isVestingComplete,
  getAllPositionNftAccountByOwner,
} from "./helpers";
import { min, max } from "bn.js";

/**
 * CpAmm SDK class to interact with the Dynamic CP-AMM
 */
export class CpAmm {
  _program: AmmProgram;
  private poolAuthority: PublicKey;
  constructor(connection: Connection) {
    this._program = new Program(CpAmmIDL as CpAmmTypes, {
      connection: connection,
    });
    this.poolAuthority = derivePoolAuthority();
  }

  //// ANCHOR: PRIVATE FUNCTIONS //////
  /**
   * Prepares token accounts for a transaction by retrieving or creating associated token accounts.
   * @private
   * @param {PublicKey} owner - The owner of the token accounts
   * @param {PublicKey} tokenAMint - Mint address of token A
   * @param {PublicKey} tokenBMint - Mint address of token B
   * @param {PublicKey} tokenAProgram - Program ID for token A (Token or Token2022)
   * @param {PublicKey} tokenBProgram - Program ID for token B (Token or Token2022)
   * @returns {Promise<{tokenAAta: PublicKey, tokenBAta: PublicKey, instructions: TransactionInstruction[]}>}
   *          The token account addresses and any instructions needed to create them
   */
  private async prepareTokenAccounts(
    params: PrepareTokenAccountParams
  ): Promise<{
    tokenAAta: PublicKey;
    tokenBAta: PublicKey;
    instructions: TransactionInstruction[];
  }> {
    const {
      payer,
      tokenAOwner,
      tokenBOwner,
      tokenAMint,
      tokenBMint,
      tokenAProgram,
      tokenBProgram,
    } = params;
    const instructions: TransactionInstruction[] = [];
    const [
      { ataPubkey: tokenAAta, ix: createInputTokenAccountIx },
      { ataPubkey: tokenBAta, ix: createOutputTokenAccountIx },
    ] = await Promise.all([
      getOrCreateATAInstruction(
        this._program.provider.connection,
        tokenAMint,
        tokenAOwner,
        payer,
        true,
        tokenAProgram
      ),
      getOrCreateATAInstruction(
        this._program.provider.connection,
        tokenBMint,
        tokenBOwner,
        payer,
        true,
        tokenBProgram
      ),
    ]);
    createInputTokenAccountIx && instructions.push(createInputTokenAccountIx);
    createOutputTokenAccountIx && instructions.push(createOutputTokenAccountIx);

    return { tokenAAta, tokenBAta, instructions };
  }

  /**
   * Derives token badge account metadata
   * @param tokenAMint - Public key of token A mint
   * @param tokenBMint - Public key of token B mint
   * @returns Array of account metadata for token badges
   */
  private getTokenBadgeAccounts(
    tokenAMint: PublicKey,
    tokenBMint: PublicKey
  ): AccountMeta[] {
    return [
      {
        pubkey: deriveTokenBadgeAddress(tokenAMint),
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: deriveTokenBadgeAddress(tokenBMint),
        isWritable: false,
        isSigner: false,
      },
    ];
  }

  /**
   * Builds an instruction to add liquidity to a position.
   * @private
   * @param {BuildAddLiquidityParams} params - Parameters for adding liquidity
   * @returns {Promise<TransactionInstruction>} Instruction to add liquidity
   */
  private async buildAddLiquidityInstruction(
    params: BuildAddLiquidityParams
  ): Promise<TransactionInstruction> {
    const {
      pool,
      position,
      positionNftAccount,
      owner,
      tokenAAccount,
      tokenBAccount,
      tokenAMint,
      tokenBMint,
      tokenAVault,
      tokenBVault,
      tokenAProgram,
      tokenBProgram,
      liquidityDelta,
      tokenAAmountThreshold,
      tokenBAmountThreshold,
    } = params;
    return await this._program.methods
      .addLiquidity({
        liquidityDelta,
        tokenAAmountThreshold,
        tokenBAmountThreshold,
      })
      .accountsPartial({
        pool,
        position,
        positionNftAccount,
        owner,
        tokenAAccount,
        tokenBAccount,
        tokenAMint,
        tokenBMint,
        tokenAVault,
        tokenBVault,
        tokenAProgram,
        tokenBProgram,
      })
      .instruction();
  }

  /**
   * Builds an instruction to remove all liquidity from a position.
   * @private
   * @param {BuildRemoveAllLiquidityInstructionParams} params - Parameters for removing all liquidity
   * @returns {Promise<TransactionInstruction>} Instruction to remove all liquidity
   */
  private async buildRemoveAllLiquidityInstruction(
    params: BuildRemoveAllLiquidityInstructionParams
  ): Promise<TransactionInstruction> {
    const {
      poolAuthority,
      owner,
      pool,
      position,
      positionNftAccount,
      tokenAAccount,
      tokenBAccount,
      tokenAAmountThreshold,
      tokenBAmountThreshold,
      tokenAMint,
      tokenBMint,
      tokenAVault,
      tokenBVault,
      tokenAProgram,
      tokenBProgram,
    } = params;
    return await this._program.methods
      .removeAllLiquidity(tokenAAmountThreshold, tokenBAmountThreshold)
      .accountsPartial({
        poolAuthority,
        pool,
        position,
        positionNftAccount,
        owner,
        tokenAAccount,
        tokenBAccount,
        tokenAMint,
        tokenBMint,
        tokenAVault,
        tokenBVault,
        tokenAProgram,
        tokenBProgram,
      })
      .instruction();
  }

  /**
   * Builds an instruction to claim fees accumulated by a position.
   * @private
   * @param {ClaimPositionFeeInstructionParams} params - Parameters for claiming position fees
   * @returns {Promise<TransactionInstruction>} Instruction to claim position fees
   */
  private async buildClaimPositionFeeInstruction(
    params: ClaimPositionFeeInstructionParams
  ): Promise<TransactionInstruction> {
    const {
      owner,
      poolAuthority,
      pool,
      position,
      positionNftAccount,
      tokenAAccount,
      tokenBAccount,
      tokenAVault,
      tokenBVault,
      tokenAMint,
      tokenBMint,
      tokenAProgram,
      tokenBProgram,
    } = params;
    return await this._program.methods
      .claimPositionFee()
      .accountsPartial({
        poolAuthority,
        owner,
        pool,
        position,
        positionNftAccount,
        tokenAAccount,
        tokenBAccount,
        tokenAVault,
        tokenBVault,
        tokenAMint,
        tokenBMint,
        tokenAProgram,
        tokenBProgram,
      })
      .instruction();
  }

  /**
   * Builds an instruction to close a position.
   * @private
   * @param {ClosePositionInstructionParams} params - Parameters for closing a position
   * @returns {Promise<TransactionInstruction>} Instruction to close the position
   */
  private async buildClosePositionInstruction(
    params: ClosePositionInstructionParams
  ): Promise<TransactionInstruction> {
    const {
      owner,
      poolAuthority,
      pool,
      position,
      positionNftAccount,
      positionNftMint,
    } = params;

    return await this._program.methods
      .closePosition()
      .accountsPartial({
        positionNftMint,
        positionNftAccount,
        pool,
        position,
        poolAuthority,
        rentReceiver: owner,
        owner,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
      })
      .instruction();
  }

  /**
   * Builds an instruction to refresh vesting for a position
   * @param params Parameters required for the refresh vesting instruction
   * @returns Transaction instruction or null if no vestings to refresh
   */
  private async buildRefreshVestingInstruction(
    params: RefreshVestingParams
  ): Promise<TransactionInstruction | null> {
    const { owner, position, positionNftAccount, pool, vestingAccounts } =
      params;

    if (vestingAccounts.length == 0) {
      return null;
    }

    return await this._program.methods
      .refreshVesting()
      .accountsPartial({
        position,
        positionNftAccount,
        pool,
        owner,
      })
      .remainingAccounts(
        vestingAccounts.map((pubkey: PublicKey) => {
          return {
            isSigner: false,
            isWritable: true,
            pubkey,
          };
        })
      )
      .instruction();
  }

  /**
   * Helper function that builds instructions to claim fees, remove liquidity, and close a position
   * @param {BuildLiquidatePositionInstructionParams} params - Parameters for liquidating a position
   * @returns {Promise<TransactionInstruction[]>} Array of instructions
   * @private
   */
  private async buildLiquidatePositionInstruction(
    params: BuildLiquidatePositionInstructionParams
  ): Promise<TransactionInstruction[]> {
    const {
      owner,
      position,
      positionNftAccount,
      positionState,
      poolState,
      tokenAAccount,
      tokenBAccount,
      tokenAAmountThreshold,
      tokenBAmountThreshold,
    } = params;

    const { nftMint: positionNftMint, pool } = positionState;
    const { tokenAMint, tokenBMint, tokenAVault, tokenBVault } = poolState;

    const tokenAProgram = getTokenProgram(poolState.tokenAFlag);
    const tokenBProgram = getTokenProgram(poolState.tokenBFlag);

    const instructions: TransactionInstruction[] = [];

    // 1. claim position fee
    const claimPositionFeeInstruction =
      await this.buildClaimPositionFeeInstruction({
        owner,
        poolAuthority: this.poolAuthority,
        pool,
        position,
        positionNftAccount,
        tokenAAccount,
        tokenBAccount,
        tokenAVault,
        tokenBVault,
        tokenAMint,
        tokenBMint,
        tokenAProgram,
        tokenBProgram,
      });

    instructions.push(claimPositionFeeInstruction);

    // 2. remove all liquidity
    const removeAllLiquidityInstruction =
      await this.buildRemoveAllLiquidityInstruction({
        poolAuthority: this.poolAuthority,
        owner,
        pool,
        position,
        positionNftAccount,
        tokenAAccount,
        tokenBAccount,
        tokenAAmountThreshold,
        tokenBAmountThreshold,
        tokenAMint,
        tokenBMint,
        tokenAVault,
        tokenBVault,
        tokenAProgram,
        tokenBProgram,
      });
    instructions.push(removeAllLiquidityInstruction);
    // 3. close position
    const closePositionInstruction = await this.buildClosePositionInstruction({
      owner,
      poolAuthority: this.poolAuthority,
      pool,
      position,
      positionNftMint,
      positionNftAccount,
    });
    instructions.push(closePositionInstruction);

    return instructions;
  }

  /**
   * Builds a instruction to create a position.
   * @param {CreatePositionParams} params - Parameters for position creation.
   * @returns Transaction instruction.
   */
  private async buildCreatePositionInstruction(
    params: CreatePositionParams
  ): Promise<{
    ix: TransactionInstruction;
    position: PublicKey;
    positionNftAccount: PublicKey;
  }> {
    const { owner, payer, pool, positionNft } = params;

    const position = derivePositionAddress(positionNft);
    const positionNftAccount = derivePositionNftAccount(positionNft);

    const ix = await this._program.methods
      .createPosition()
      .accountsPartial({
        owner,
        positionNftMint: positionNft,
        poolAuthority: this.poolAuthority,
        positionNftAccount,
        payer: payer,
        pool,
        position,
        tokenProgram: TOKEN_2022_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
      })
      .instruction();

    return {
      ix,
      position,
      positionNftAccount,
    };
  }

  /**
   * Private helper method to prepare common customizable pool creation logic
   * @param {PrepareCustomizablePoolParams} params - Common parameters for pool creation
   * @returns Prepared transaction data including instructions and accounts
   */
  private async prepareCreatePoolParams(params: PrepareCustomizablePoolParams) {
    const {
      pool,
      tokenAMint,
      tokenBMint,
      tokenAAmount,
      tokenBAmount,
      payer,
      positionNft,
      tokenAProgram,
      tokenBProgram,
    } = params;

    const position = derivePositionAddress(positionNft);
    const positionNftAccount = derivePositionNftAccount(positionNft);

    const tokenAVault = deriveTokenVaultAddress(tokenAMint, pool);
    const tokenBVault = deriveTokenVaultAddress(tokenBMint, pool);

    const {
      tokenAAta: payerTokenA,
      tokenBAta: payerTokenB,
      instructions: preInstructions,
    } = await this.prepareTokenAccounts({
      payer,
      tokenAOwner: payer,
      tokenBOwner: payer,
      tokenAMint,
      tokenBMint,
      tokenAProgram,
      tokenBProgram,
    });

    if (tokenAMint.equals(NATIVE_MINT)) {
      const wrapSOLIx = wrapSOLInstruction(
        payer,
        payerTokenA,
        BigInt(tokenAAmount.toString())
      );

      preInstructions.push(...wrapSOLIx);
    }

    if (tokenBMint.equals(NATIVE_MINT)) {
      const wrapSOLIx = wrapSOLInstruction(
        payer,
        payerTokenB,
        BigInt(tokenBAmount.toString())
      );

      preInstructions.push(...wrapSOLIx);
    }
    const tokenBadgeAccounts = this.getTokenBadgeAccounts(
      tokenAMint,
      tokenBMint
    );

    return {
      position,
      positionNftAccount,
      tokenAVault,
      tokenBVault,
      payerTokenA,
      payerTokenB,
      preInstructions,
      tokenBadgeAccounts,
    };
  }

  /**
   * Sets up token accounts and instructions for fee claim operations.
   * @private
   * @param {SetupFeeClaimAccountsParams} params - Parameters for setting up fee claim accounts.
   * @returns Token accounts and instructions for fee claiming.
   */
  private async setupFeeClaimAccounts(
    params: SetupFeeClaimAccountsParams
  ): Promise<{
    tokenAAccount: PublicKey;
    tokenBAccount: PublicKey;
    preInstructions: TransactionInstruction[];
    postInstructions: TransactionInstruction[];
  }> {
    const {
      payer,
      owner,
      tokenAMint,
      tokenBMint,
      tokenAProgram,
      tokenBProgram,
      receiver,
      tempWSolAccount,
    } = params;

    const tokenAIsSOL = tokenAMint.equals(NATIVE_MINT);
    const tokenBIsSOL = tokenBMint.equals(NATIVE_MINT);
    const hasSolToken = tokenAIsSOL || tokenBIsSOL;

    const preInstructions: TransactionInstruction[] = [];
    const postInstructions: TransactionInstruction[] = [];
    let tokenAAccount: PublicKey;
    let tokenBAccount: PublicKey;

    let tokenAOwner = owner;
    let tokenBOwner = owner;
    if (receiver) {
      tokenAOwner = tokenAIsSOL ? tempWSolAccount : receiver;
      tokenBOwner = tokenBIsSOL ? tempWSolAccount : receiver;
    }

    const { tokenAAta, tokenBAta, instructions } =
      await this.prepareTokenAccounts({
        payer,
        tokenAOwner,
        tokenBOwner,
        tokenAMint,
        tokenBMint,
        tokenAProgram,
        tokenBProgram,
      });

    tokenAAccount = tokenAAta;
    tokenBAccount = tokenBAta;
    preInstructions.push(...instructions);

    if (hasSolToken) {
      const closeWrappedSOLIx = await unwrapSOLInstruction(
        tempWSolAccount ?? owner,
        receiver ?? owner
      );
      closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
    }
    return {
      tokenAAccount,
      tokenBAccount,
      preInstructions,
      postInstructions,
    };
  }

  //// ANCHOR: GETTER/FETCHER FUNCTIONS //////

  /**
   * Fetches the Config state of the program.
   * @param config - Public key of the config account.
   * @returns Parsed ConfigState.
   */
  async fetchConfigState(config: PublicKey): Promise<ConfigState> {
    const configState = await this._program.account.config.fetchNullable(
      config
    );
    invariant(configState, `Config account: ${config} not found`);

    return configState;
  }

  /**
   * Fetches the Pool state.
   * @param pool - Public key of the pool.
   * @returns Parsed PoolState.
   */
  async fetchPoolState(pool: PublicKey): Promise<PoolState> {
    const poolState = await this._program.account.pool.fetchNullable(pool);
    invariant(poolState, `Pool account: ${pool} not found`);

    return poolState;
  }

  /**
   * Fetches the Position state.
   * @param position - Public key of the position.
   * @returns Parsed PositionState.
   */
  async fetchPositionState(position: PublicKey): Promise<PositionState> {
    const positionState = await this._program.account.position.fetchNullable(
      position
    );
    invariant(positionState, `Position account: ${position} not found`);

    return positionState;
  }

  /**
   * Retrieves all config accounts.
   * @returns Array of config public keys and their states.
   */
  async getAllConfigs(): Promise<
    Array<{ publicKey: PublicKey; account: ConfigState }>
  > {
    const configAccounts = await this._program.account.config.all();

    return configAccounts;
  }

  /**
   * Retrieves all pool accounts.
   * @returns Array of pool public keys and their states.
   */
  async getAllPools(): Promise<
    Array<{ publicKey: PublicKey; account: PoolState }>
  > {
    const poolAccounts = await this._program.account.pool.all();

    return poolAccounts;
  }

  /**
   * Retrieves all position accounts.
   * @returns Array of position public keys and their states.
   */
  async getAllPositions(): Promise<
    Array<{
      publicKey: PublicKey;
      account: PositionState;
    }>
  > {
    const poolAccounts = await this._program.account.position.all();

    return poolAccounts;
  }

  /**
   * Gets all positions a specific pool.
   * @param pool - Public key of the pool.
   * @returns List of user positions for the pool.
   */
  async getAllPositionsByPool(pool: PublicKey): Promise<
    Array<{
      publicKey: PublicKey;
      account: PositionState;
    }>
  > {
    return await this._program.account.position.all([
      positionByPoolFilter(pool),
    ]);
  }

  /**
   * Gets all positions of a user for a specific pool.
   * @param pool - Public key of the pool.
   * @param user - Public key of the user.
   * @returns List of user positions for the pool.
   */
  async getUserPositionByPool(
    pool: PublicKey,
    user: PublicKey
  ): Promise<
    Array<{
      positionNftAccount: PublicKey;
      position: PublicKey;
      positionState: PositionState;
    }>
  > {
    const allUserPositions = await this.getPositionsByUser(user);
    return allUserPositions.filter((position) =>
      position.positionState.pool.equals(pool)
    );
  }

  /**
   * Gets all positions of a user across all pools.
   * @param user - Public key of the user.
   * @returns Array of user positions already sorted by liquidity
   */
  async getPositionsByUser(user: PublicKey): Promise<
    Array<{
      positionNftAccount: PublicKey;
      position: PublicKey;
      positionState: PositionState;
    }>
  > {
    const userPositionAccounts = await getAllPositionNftAccountByOwner(
      this._program.provider.connection,
      user
    );
    if (userPositionAccounts.length === 0) {
      return [];
    }

    const positionAddresses = userPositionAccounts.map((account) =>
      derivePositionAddress(account.positionNft)
    );

    const positionStates = await this._program.account.position.fetchMultiple(
      positionAddresses
    );
    const positionResult = userPositionAccounts
      .map((account, index) => {
        const positionState = positionStates[index];
        if (!positionState) return null;

        return {
          positionNftAccount: account.positionNftAccount,
          position: positionAddresses[index],
          positionState,
        };
      })
      .filter(Boolean);

    // in-place sort
    positionResult.sort((a, b) => {
      const totalLiquidityA = a.positionState.vestedLiquidity
        .add(a.positionState.permanentLockedLiquidity)
        .add(a.positionState.unlockedLiquidity);

      const totalLiquidityB = b.positionState.vestedLiquidity
        .add(b.positionState.permanentLockedLiquidity)
        .add(b.positionState.unlockedLiquidity);

      return totalLiquidityB.cmp(totalLiquidityA);
    });

    return positionResult;
  }

  async getAllVestingsByPosition(position: PublicKey): Promise<
    Array<{
      publicKey: PublicKey;
      account: VestingState;
    }>
  > {
    const vestings = await this._program.account.vesting.all([
      vestingByPositionFilter(position),
    ]);

    return vestings;
  }

  isLockedPosition(position: PositionState): boolean {
    const totalLockedLiquidity = position.vestedLiquidity.add(
      position.permanentLockedLiquidity
    );

    return totalLockedLiquidity.gtn(0);
  }

  isPermanentLockedPosition(positionState: PositionState): boolean {
    return positionState.permanentLockedLiquidity.gtn(0);
  }

  /**
   * Checks if a position can be unlocked based on its locking state and vesting schedules.
   *
   * This method evaluates whether a position is eligible for operations that require
   * unlocked liquidity, such as removing all liquidity or closing the position. It checks both
   * permanent locks and time-based vesting schedules.
   *
   * @private
   * @param {PositionState} positionState - The current state of the position
   * @param {Array<{account: PublicKey; vestingState: VestingState}>} vestings - Array of vesting accounts and their states
   * @param {BN} currentPoint - Current timestamp or slot number (depending on activation type of pool)
   *
   * @returns {Object} Result object containing unlock status and reason
   * @returns {boolean} result.canUnlock - Whether the position can be unlocked
   * @returns {string|undefined} result.reason - Reason why position cannot be unlocked (if applicable)
   */
  canUnlockPosition(
    positionState: PositionState,
    vestings: Array<{ account: PublicKey; vestingState: VestingState }>,
    currentPoint: BN
  ): { canUnlock: boolean; reason?: string } {
    if (vestings.length > 0) {
      // Check if permanently locked
      if (this.isPermanentLockedPosition(positionState)) {
        return {
          canUnlock: false,
          reason: "Position is permanently locked",
        };
      }

      // Check each vesting
      // We expect that should have only one vesting per position
      for (const vesting of vestings) {
        if (!isVestingComplete(vesting.vestingState, currentPoint)) {
          return {
            canUnlock: false,
            reason: "Position has incomplete vesting schedule",
          };
        }
      }
    }

    return { canUnlock: true };
  }

  async isPoolExist(pool: PublicKey): Promise<boolean> {
    const poolState = await this._program.account.pool.fetchNullable(pool);
    return poolState !== null;
  }

  /**
   * Computes the liquidity delta based on the provided token amounts and sqrt price
   *
   * @param {LiquidityDeltaParams} params - The parameters for liquidity calculation
   * @returns {Promise<BN>} - The computed liquidity delta in Q64 value.
   */
  getLiquidityDelta(params: LiquidityDeltaParams): BN {
    const {
      maxAmountTokenA,
      maxAmountTokenB,
      sqrtMaxPrice,
      sqrtMinPrice,
      sqrtPrice,
    } = params;

    const liquidityDeltaFromAmountA = getLiquidityDeltaFromAmountA(
      maxAmountTokenA,
      sqrtPrice,
      sqrtMaxPrice
    );

    const liquidityDeltaFromAmountB = getLiquidityDeltaFromAmountB(
      maxAmountTokenB,
      sqrtMinPrice,
      sqrtPrice
    );

    return min(liquidityDeltaFromAmountA, liquidityDeltaFromAmountB);
  }

  /**
   * Calculates swap quote based on input amount and pool state.
   * @param params - Swap parameters including input amount, pool state, slippage, etc.
   * @returns Swap quote including expected output amount, fee, and price impact.
   */
  getQuote(params: GetQuoteParams): {
    swapInAmount: BN;
    consumedInAmount: BN;
    swapOutAmount: BN;
    minSwapOutAmount: BN;
    totalFee: BN;
    priceImpact: number;
  } {
    const {
      inAmount,
      inputTokenMint,
      slippage,
      poolState,
      currentTime,
      currentSlot,
      inputTokenInfo,
      outputTokenInfo,
    } = params;
    const {
      sqrtPrice: sqrtPriceQ64,
      liquidity: liquidityQ64,
      activationType,
      activationPoint,
      collectFeeMode,
      poolFees,
    } = poolState;
    const {
      feeSchedulerMode,
      cliffFeeNumerator,
      numberOfPeriod,
      reductionFactor,
      periodFrequency,
    } = poolFees.baseFee;
    const dynamicFee = poolFees.dynamicFee;

    let actualAmountIn = inAmount;
    if (inputTokenInfo) {
      actualAmountIn = calculateTransferFeeExcludedAmount(
        inAmount,
        inputTokenInfo.mint,
        inputTokenInfo.currentEpoch
      ).amount;
    }
    const aToB = poolState.tokenAMint.equals(inputTokenMint);
    const currentPoint = activationType ? currentTime : currentSlot;

    let dynamicFeeParams: DynamicFeeParams;
    if (dynamicFee.initialized) {
      const { volatilityAccumulator, binStep, variableFeeControl } = dynamicFee;
      dynamicFeeParams = { volatilityAccumulator, binStep, variableFeeControl };
    }

    const tradeFeeNumerator = getFeeNumerator(
      currentPoint,
      activationPoint,
      numberOfPeriod,
      periodFrequency,
      feeSchedulerMode,
      cliffFeeNumerator,
      reductionFactor,
      dynamicFeeParams
    );

    const { amountOut, totalFee, nextSqrtPrice } = getSwapAmount(
      actualAmountIn,
      sqrtPriceQ64,
      liquidityQ64,
      tradeFeeNumerator,
      aToB,
      collectFeeMode
    );

    let actualAmountOut = amountOut;
    if (outputTokenInfo) {
      actualAmountOut = calculateTransferFeeExcludedAmount(
        amountOut,
        outputTokenInfo.mint,
        outputTokenInfo.currentEpoch
      ).amount;
    }

    const minSwapOutAmount = getMinAmountWithSlippage(
      actualAmountOut,
      slippage
    );

    return {
      swapInAmount: inAmount,
      consumedInAmount: actualAmountIn,
      swapOutAmount: actualAmountOut,
      minSwapOutAmount,
      totalFee,
      priceImpact: getPriceImpact(nextSqrtPrice, sqrtPriceQ64),
    };
  }

  /**
   * Calculates the deposit quote for liquidity pool.
   *
   * @param {GetDepositQuoteParams} params - The parameters for calculating the deposit quote.
   *
   * @returns {Promise<Object>} Deposit quote results
   * @returns {BN} returns.actualInputAmount - The actual amount used as input (after deducting transfer fees).
   * @returns {BN} returns.outputAmount - The calculated corresponding amount of the other token.
   * @returns {BN} returns.liquidityDelta - The amount of liquidity that will be added to the pool.
   */
  getDepositQuote(params: GetDepositQuoteParams): DepositQuote {
    const {
      inAmount,
      isTokenA,
      inputTokenInfo,
      outputTokenInfo,
      minSqrtPrice,
      maxSqrtPrice,
      sqrtPrice,
    } = params;

    const actualAmountIn = inputTokenInfo
      ? calculateTransferFeeExcludedAmount(
          inAmount,
          inputTokenInfo.mint,
          inputTokenInfo.currentEpoch
        ).amount
      : inAmount;

    const { liquidityDelta, rawAmount } = isTokenA
      ? {
          liquidityDelta: getLiquidityDeltaFromAmountA(
            actualAmountIn,
            sqrtPrice,
            maxSqrtPrice
          ),
          rawAmount: (delta: BN) =>
            getAmountBFromLiquidityDelta(
              delta,
              sqrtPrice,
              minSqrtPrice,
              Rounding.Up
            ),
        }
      : {
          liquidityDelta: getLiquidityDeltaFromAmountB(
            actualAmountIn,
            minSqrtPrice,
            sqrtPrice
          ),
          rawAmount: (delta: BN) =>
            getAmountAFromLiquidityDelta(
              delta,
              sqrtPrice,
              maxSqrtPrice,
              Rounding.Up
            ),
        };

    const rawOutputAmount = new BN(rawAmount(liquidityDelta));
    const outputAmount = outputTokenInfo
      ? calculateTransferFeeIncludedAmount(
          rawOutputAmount,
          outputTokenInfo.mint,
          outputTokenInfo.currentEpoch
        ).amount
      : rawOutputAmount;

    return {
      actualInputAmount: actualAmountIn,
      consumedInputAmount: inAmount,
      liquidityDelta,
      outputAmount,
    };
  }

  /**
   * Calculates the withdrawal quote for removing liquidity from a concentrated liquidity pool.
   *
   * @param {GetWithdrawQuoteParams} params - The parameters for calculating the withdraw quote
   *
   * @param {Object|null} params.tokenATokenInfo - must provide if token a is token2022
   * @param {Object|null} params.tokenBTokenInfo - must provide if token b is token2022
   *
   * @returns {Promise<Object>} Withdrawal quote results
   * @returns {BN} returns.liquidityDelta - The amount of liquidity that will be removed from the pool
   * @returns {BN} returns.outAmountA - The calculated amount of token A to be received (after deducting transfer fees)
   * @returns {BN} returns.outAmountB - The calculated amount of token B to be received (after deducting transfer fees)
   */
  getWithdrawQuote(params: GetWithdrawQuoteParams): WithdrawQuote {
    const {
      liquidityDelta,
      sqrtPrice,
      maxSqrtPrice,
      minSqrtPrice,
      tokenATokenInfo,
      tokenBTokenInfo,
    } = params;
    const amountA = getAmountAFromLiquidityDelta(
      liquidityDelta,
      sqrtPrice,
      maxSqrtPrice,
      Rounding.Down
    );
    const amountB = getAmountBFromLiquidityDelta(
      liquidityDelta,
      sqrtPrice,
      minSqrtPrice,
      Rounding.Down
    );

    return {
      liquidityDelta,
      outAmountA: tokenATokenInfo
        ? calculateTransferFeeExcludedAmount(
            amountA,
            tokenATokenInfo.mint,
            tokenATokenInfo.currentEpoch
          ).amount
        : amountA,
      outAmountB: tokenBTokenInfo
        ? calculateTransferFeeExcludedAmount(
            amountB,
            tokenBTokenInfo.mint,
            tokenBTokenInfo.currentEpoch
          ).amount
        : amountB,
    };
  }

  /**
   * Calculates liquidity and corresponding token amounts for token A single-sided pool creation
   * Only supports initialization where initial price equals min sqrt price
   * @param params Parameters for single-sided pool creation
   * @returns Calculated liquidity delta
   */
  preparePoolCreationSingleSide(params: PreparePoolCreationSingleSide): BN {
    const {
      tokenAAmount,
      initSqrtPrice,
      minSqrtPrice,
      maxSqrtPrice,
      tokenAInfo,
    } = params;

    if (!initSqrtPrice.eq(minSqrtPrice)) {
      throw new Error("Only support single side for base token.");
    }

    const actualAmountIn = tokenAInfo
      ? tokenAAmount.sub(
          calculateTransferFeeIncludedAmount(
            tokenAAmount,
            tokenAInfo.mint,
            tokenAInfo.currentEpoch
          ).transferFee
        )
      : tokenAAmount;

    const liquidityDelta = getLiquidityDeltaFromAmountA(
      actualAmountIn,
      initSqrtPrice,
      maxSqrtPrice
    );

    return liquidityDelta;
  }

  /**
   * Prepares parameters required for pool creation, including initial sqrt price and liquidity.
   * @private
   * @param {PreparePoolCreationParams} params - Initial token amounts for pool creation.
   * @returns init sqrt price and liquidity in Q64 format.
   */
  preparePoolCreationParams(
    params: PreparePoolCreationParams
  ): PreparedPoolCreation {
    const {
      tokenAAmount,
      tokenBAmount,
      minSqrtPrice,
      maxSqrtPrice,
      tokenAInfo,
      tokenBInfo,
    } = params;

    if (tokenAAmount.eq(new BN(0)) && tokenBAmount.eq(new BN(0))) {
      throw new Error("Invalid input amount");
    }

    const actualAmountAIn = tokenAInfo
      ? tokenAAmount.sub(
          calculateTransferFeeIncludedAmount(
            tokenAAmount,
            tokenAInfo.mint,
            tokenAInfo.currentEpoch
          ).transferFee
        )
      : tokenAAmount;

    const actualAmountBIn = tokenBInfo
      ? tokenBAmount.sub(
          calculateTransferFeeIncludedAmount(
            tokenBAmount,
            tokenBInfo.mint,
            tokenBInfo.currentEpoch
          ).transferFee
        )
      : tokenBAmount;

    const initSqrtPrice = calculateInitSqrtPrice(
      tokenAAmount,
      tokenBAmount,
      minSqrtPrice,
      maxSqrtPrice
    );

    const liquidityDeltaFromAmountA = getLiquidityDeltaFromAmountA(
      actualAmountAIn,
      initSqrtPrice,
      maxSqrtPrice
    );

    const liquidityDeltaFromAmountB = getLiquidityDeltaFromAmountB(
      actualAmountBIn,
      minSqrtPrice,
      initSqrtPrice
    );

    const liquidityDelta = min(
      liquidityDeltaFromAmountA,
      liquidityDeltaFromAmountB
    );

    return {
      initSqrtPrice,
      liquidityDelta,
    };
  }

  //// ANCHOR: MAIN ENDPOINT //////
  /**
   * Builds a transaction to create a permissionless pool.
   * @param params - Parameters for pool creation.
   * @returns Transaction builder.
   */
  async createPool(params: CreatePoolParams): TxBuilder {
    const {
      payer,
      creator,
      config,
      positionNft,
      tokenAMint,
      tokenBMint,
      initSqrtPrice,
      liquidityDelta,
      activationPoint,
      tokenAAmount,
      tokenBAmount,
      tokenAProgram,
      tokenBProgram,
      isLockLiquidity,
    } = params;

    const pool = derivePoolAddress(config, tokenAMint, tokenBMint);
    const {
      position,
      positionNftAccount,
      tokenAVault,
      tokenBVault,
      payerTokenA,
      payerTokenB,
      preInstructions,
      tokenBadgeAccounts,
    } = await this.prepareCreatePoolParams({
      pool,
      tokenAMint,
      tokenBMint,
      tokenAAmount,
      tokenBAmount,
      payer,
      positionNft,
      tokenAProgram,
      tokenBProgram,
    });

    const postInstruction: TransactionInstruction[] = [];

    if (isLockLiquidity) {
      const permanentLockIx = await this._program.methods
        .permanentLockPosition(liquidityDelta)
        .accountsPartial({
          position,
          positionNftAccount,
          pool: pool,
          owner: creator,
        })
        .instruction();
      postInstruction.push(permanentLockIx);
    }

    const tx = await this._program.methods
      .initializePool({
        liquidity: liquidityDelta,
        sqrtPrice: initSqrtPrice,
        activationPoint: activationPoint,
      })
      .accountsPartial({
        creator,
        positionNftAccount,
        positionNftMint: positionNft,
        payer,
        config,
        poolAuthority: this.poolAuthority,
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
      .preInstructions(preInstructions)
      .postInstructions(postInstruction)
      .remainingAccounts(tokenBadgeAccounts)
      .transaction();

    return tx;
  }

  /**
   * Builds a transaction to create a customizable pool.
   * @param params - Parameters for customizable pool creation.
   * @returns Transaction and related addresses.
   */
  async createCustomPool(params: InitializeCustomizeablePoolParams): Promise<{
    tx: Transaction;
    pool: PublicKey;
    position: PublicKey;
  }> {
    const {
      tokenAMint,
      tokenBMint,
      tokenAAmount,
      tokenBAmount,
      sqrtMinPrice,
      sqrtMaxPrice,
      liquidityDelta,
      initSqrtPrice,
      payer,
      creator,
      positionNft,
      poolFees,
      hasAlphaVault,
      collectFeeMode,
      activationPoint,
      activationType,
      tokenAProgram,
      tokenBProgram,
      isLockLiquidity,
    } = params;
    const pool = deriveCustomizablePoolAddress(tokenAMint, tokenBMint);
    const {
      position,
      positionNftAccount,
      tokenAVault,
      tokenBVault,
      payerTokenA,
      payerTokenB,
      preInstructions,
      tokenBadgeAccounts,
    } = await this.prepareCreatePoolParams({
      pool,
      tokenAMint,
      tokenBMint,
      tokenAAmount,
      tokenBAmount: tokenBMint.equals(NATIVE_MINT)
        ? max(tokenBAmount, new BN(1))
        : tokenBAmount,
      payer,
      positionNft,
      tokenAProgram,
      tokenBProgram,
    });

    const postInstruction: TransactionInstruction[] = [];

    if (isLockLiquidity) {
      const permanentLockIx = await this._program.methods
        .permanentLockPosition(liquidityDelta)
        .accountsPartial({
          position,
          positionNftAccount,
          pool: pool,
          owner: creator,
        })
        .instruction();
      postInstruction.push(permanentLockIx);
    }

    const transaction = await this._program.methods
      .initializeCustomizablePool({
        poolFees,
        sqrtMinPrice,
        sqrtMaxPrice,
        hasAlphaVault,
        liquidity: liquidityDelta,
        sqrtPrice: initSqrtPrice,
        activationType,
        collectFeeMode,
        activationPoint,
      })
      .accountsPartial({
        creator,
        positionNftAccount,
        positionNftMint: positionNft,
        payer: payer,
        poolAuthority: this.poolAuthority,
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
      .preInstructions(preInstructions)
      .postInstructions(postInstruction)
      .remainingAccounts(tokenBadgeAccounts)
      .transaction();

    return { tx: transaction, pool, position };
  }

  async createCustomPoolWithDynamicConfig(
    params: InitializeCustomizeablePoolWithDynamicConfigParams
  ): Promise<{
    tx: Transaction;
    pool: PublicKey;
    position: PublicKey;
  }> {
    const {
      tokenAMint,
      tokenBMint,
      tokenAAmount,
      tokenBAmount,
      sqrtMinPrice,
      sqrtMaxPrice,
      liquidityDelta,
      initSqrtPrice,
      payer,
      config,
      poolCreatorAuthority,
      creator,
      positionNft,
      poolFees,
      hasAlphaVault,
      collectFeeMode,
      activationPoint,
      activationType,
      tokenAProgram,
      tokenBProgram,
      isLockLiquidity,
    } = params;

    const pool = derivePoolAddress(config, tokenAMint, tokenBMint);
    const {
      position,
      positionNftAccount,
      tokenAVault,
      tokenBVault,
      payerTokenA,
      payerTokenB,
      preInstructions,
      tokenBadgeAccounts,
    } = await this.prepareCreatePoolParams({
      pool,
      tokenAMint,
      tokenBMint,
      tokenAAmount,
      tokenBAmount,
      payer,
      positionNft,
      tokenAProgram,
      tokenBProgram,
    });

    const postInstruction: TransactionInstruction[] = [];

    if (isLockLiquidity) {
      const permanentLockIx = await this._program.methods
        .permanentLockPosition(liquidityDelta)
        .accountsPartial({
          position,
          positionNftAccount,
          pool: pool,
          owner: creator,
        })
        .instruction();
      postInstruction.push(permanentLockIx);
    }

    const transaction = await this._program.methods
      .initializePoolWithDynamicConfig({
        poolFees,
        sqrtMinPrice,
        sqrtMaxPrice,
        hasAlphaVault,
        liquidity: liquidityDelta,
        sqrtPrice: initSqrtPrice,
        activationType,
        collectFeeMode,
        activationPoint,
      })
      .accountsPartial({
        creator,
        positionNftAccount,
        positionNftMint: positionNft,
        payer: payer,
        poolAuthority: this.poolAuthority,
        pool,
        position,
        poolCreatorAuthority: poolCreatorAuthority,
        config: config,
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
      .preInstructions(preInstructions)
      .postInstructions(postInstruction)
      .remainingAccounts(tokenBadgeAccounts)
      .transaction();

    return { tx: transaction, pool, position };
  }

  /**
   * Builds a transaction to create a position.
   * @param {CreatePositionParams} params - Parameters for position creation.
   * @returns Transaction builder.
   */
  async createPosition(params: CreatePositionParams): TxBuilder {
    const { ix } = await this.buildCreatePositionInstruction(params);
    return new Transaction().add(ix);
  }

  /**
   * Builds a transaction to add liquidity to an existing position.
   * @param {AddLiquidityParams} params - Parameters for adding liquidity.
   * @returns Transaction builder.
   */
  async addLiquidity(params: AddLiquidityParams): TxBuilder {
    const {
      owner,
      pool,
      position,
      positionNftAccount,
      liquidityDelta,
      maxAmountTokenA,
      maxAmountTokenB,
      tokenAAmountThreshold,
      tokenBAmountThreshold,
      tokenAMint,
      tokenBMint,
      tokenAVault,
      tokenBVault,
      tokenAProgram,
      tokenBProgram,
    } = params;

    const {
      tokenAAta: tokenAAccount,
      tokenBAta: tokenBAccount,
      instructions: preInstructions,
    } = await this.prepareTokenAccounts({
      payer: owner,
      tokenAOwner: owner,
      tokenBOwner: owner,
      tokenAMint,
      tokenBMint,
      tokenAProgram,
      tokenBProgram,
    });

    if (tokenAMint.equals(NATIVE_MINT)) {
      const wrapSOLIx = wrapSOLInstruction(
        owner,
        tokenAAccount,
        BigInt(maxAmountTokenA.toString())
      );

      preInstructions.push(...wrapSOLIx);
    }

    if (tokenBMint.equals(NATIVE_MINT)) {
      const wrapSOLIx = wrapSOLInstruction(
        owner,
        tokenBAccount,
        BigInt(maxAmountTokenB.toString())
      );

      preInstructions.push(...wrapSOLIx);
    }

    const postInstructions: TransactionInstruction[] = [];
    if (
      [tokenAMint.toBase58(), tokenBMint.toBase58()].includes(
        NATIVE_MINT.toBase58()
      )
    ) {
      const closeWrappedSOLIx = await unwrapSOLInstruction(owner);
      closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
    }

    const addLiquidityInstruction = await this.buildAddLiquidityInstruction({
      pool,
      position,
      positionNftAccount,
      owner,
      tokenAAccount,
      tokenBAccount,
      tokenAMint,
      tokenBMint,
      tokenAVault,
      tokenBVault,
      tokenAProgram,
      tokenBProgram,
      liquidityDelta,
      tokenAAmountThreshold,
      tokenBAmountThreshold,
    });

    const transaction = new Transaction();
    transaction.add(
      ...(preInstructions.length > 0 ? preInstructions : []),
      addLiquidityInstruction,
      ...(postInstructions.length > 0 ? postInstructions : [])
    );

    return transaction;
  }

  /**
   * Creates a new position and add liquidity to position it in a single transaction.
   * Handles both native SOL and other tokens, automatically wrapping/unwrapping SOL as needed.
   *
   * @param {CreatePositionAndAddLiquidity} params - Parameters for creating position and adding liquidity
   *
   * @returns {Transaction} A transaction that creates a position and adds liquidity
   *
   **/
  async createPositionAndAddLiquidity(
    params: CreatePositionAndAddLiquidity
  ): TxBuilder {
    const {
      owner,
      pool,
      positionNft,
      liquidityDelta,
      maxAmountTokenA,
      maxAmountTokenB,
      tokenAAmountThreshold,
      tokenBAmountThreshold,
      tokenAMint,
      tokenBMint,
      tokenAProgram,
      tokenBProgram,
    } = params;

    const {
      tokenAAta: tokenAAccount,
      tokenBAta: tokenBAccount,
      instructions: preInstructions,
    } = await this.prepareTokenAccounts({
      payer: owner,
      tokenAOwner: owner,
      tokenBOwner: owner,
      tokenAMint,
      tokenBMint,
      tokenAProgram,
      tokenBProgram,
    });

    const tokenAVault = deriveTokenVaultAddress(tokenAMint, pool);
    const tokenBVault = deriveTokenVaultAddress(tokenBMint, pool);

    if (tokenAMint.equals(NATIVE_MINT)) {
      const wrapSOLIx = wrapSOLInstruction(
        owner,
        tokenAAccount,
        BigInt(maxAmountTokenA.toString())
      );

      preInstructions.push(...wrapSOLIx);
    }

    if (tokenBMint.equals(NATIVE_MINT)) {
      const wrapSOLIx = wrapSOLInstruction(
        owner,
        tokenBAccount,
        BigInt(maxAmountTokenB.toString())
      );

      preInstructions.push(...wrapSOLIx);
    }

    const postInstructions: TransactionInstruction[] = [];
    if (
      [tokenAMint.toBase58(), tokenBMint.toBase58()].includes(
        NATIVE_MINT.toBase58()
      )
    ) {
      const closeWrappedSOLIx = await unwrapSOLInstruction(owner);
      closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
    }

    const {
      ix: createPositionIx,
      position,
      positionNftAccount,
    } = await this.buildCreatePositionInstruction({
      owner,
      payer: owner,
      pool,
      positionNft,
    });

    const addLiquidityInstruction = await this.buildAddLiquidityInstruction({
      pool,
      position,
      positionNftAccount,
      owner,
      tokenAAccount,
      tokenBAccount,
      tokenAMint,
      tokenBMint,
      tokenAVault,
      tokenBVault,
      tokenAProgram,
      tokenBProgram,
      liquidityDelta,
      tokenAAmountThreshold,
      tokenBAmountThreshold,
    });

    const transaction = new Transaction();
    transaction.add(createPositionIx);
    transaction.add(
      ...(preInstructions.length > 0 ? preInstructions : []),
      addLiquidityInstruction,
      ...(postInstructions.length > 0 ? postInstructions : [])
    );

    return transaction;
  }

  /**
   * Builds a transaction to remove liquidity from a position.
   * @param {RemoveLiquidityParams} params - Parameters for removing liquidity.
   * @returns Transaction builder.
   */
  async removeLiquidity(params: RemoveLiquidityParams): TxBuilder {
    const {
      owner,
      pool,
      position,
      positionNftAccount,
      liquidityDelta,
      tokenAAmountThreshold,
      tokenBAmountThreshold,
      tokenAMint,
      tokenBMint,
      tokenAVault,
      tokenBVault,
      tokenAProgram,
      tokenBProgram,
      vestings,
    } = params;

    const {
      tokenAAta: tokenAAccount,
      tokenBAta: tokenBAccount,
      instructions: preInstructions,
    } = await this.prepareTokenAccounts({
      payer: owner,
      tokenAOwner: owner,
      tokenBOwner: owner,
      tokenAMint,
      tokenBMint,
      tokenAProgram,
      tokenBProgram,
    });

    const postInstructions: TransactionInstruction[] = [];
    if (
      [tokenAMint.toBase58(), tokenBMint.toBase58()].includes(
        NATIVE_MINT.toBase58()
      )
    ) {
      const closeWrappedSOLIx = await unwrapSOLInstruction(owner);
      closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
    }

    if (vestings.length > 0) {
      const refreshVestingInstruction =
        await this.buildRefreshVestingInstruction({
          owner,
          position,
          positionNftAccount,
          pool,
          vestingAccounts: vestings.map((item) => item.account),
        });
      refreshVestingInstruction &&
        preInstructions.push(refreshVestingInstruction);
    }

    return await this._program.methods
      .removeLiquidity({
        liquidityDelta,
        tokenAAmountThreshold,
        tokenBAmountThreshold,
      })
      .accountsPartial({
        poolAuthority: this.poolAuthority,
        pool,
        position,
        positionNftAccount,
        owner,
        tokenAAccount,
        tokenBAccount,
        tokenAMint,
        tokenBMint,
        tokenAVault,
        tokenBVault,
        tokenAProgram,
        tokenBProgram,
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .transaction();
  }

  /**
   * Builds a transaction to remove liquidity from a position.
   * @param {RemoveLiquidityParams} params - Parameters for removing liquidity.
   * @returns Transaction builder.
   */
  async removeAllLiquidity(params: RemoveAllLiquidityParams): TxBuilder {
    const {
      owner,
      pool,
      position,
      positionNftAccount,
      tokenAAmountThreshold,
      tokenBAmountThreshold,
      tokenAMint,
      tokenBMint,
      tokenAVault,
      tokenBVault,
      tokenAProgram,
      tokenBProgram,
      vestings,
    } = params;

    const {
      tokenAAta: tokenAAccount,
      tokenBAta: tokenBAccount,
      instructions: preInstructions,
    } = await this.prepareTokenAccounts({
      payer: owner,
      tokenAOwner: owner,
      tokenBOwner: owner,
      tokenAMint,
      tokenBMint,
      tokenAProgram,
      tokenBProgram,
    });

    const postInstructions: TransactionInstruction[] = [];
    if (
      [tokenAMint.toBase58(), tokenBMint.toBase58()].includes(
        NATIVE_MINT.toBase58()
      )
    ) {
      const closeWrappedSOLIx = await unwrapSOLInstruction(owner);
      closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
    }

    if (vestings.length > 0) {
      const refreshVestingInstruction =
        await this.buildRefreshVestingInstruction({
          owner,
          position,
          positionNftAccount,
          pool,
          vestingAccounts: vestings.map((item) => item.account),
        });
      refreshVestingInstruction &&
        preInstructions.push(refreshVestingInstruction);
    }

    const removeAllLiquidityInstruction =
      await this.buildRemoveAllLiquidityInstruction({
        poolAuthority: this.poolAuthority,
        owner,
        pool,
        position,
        positionNftAccount,
        tokenAAccount,
        tokenBAccount,
        tokenAAmountThreshold,
        tokenBAmountThreshold,
        tokenAMint,
        tokenBMint,
        tokenAVault,
        tokenBVault,
        tokenAProgram,
        tokenBProgram,
      });

    const transaction = new Transaction();
    transaction.add(
      ...(preInstructions.length > 0 ? preInstructions : []),
      removeAllLiquidityInstruction,
      ...(postInstructions.length > 0 ? postInstructions : [])
    );

    return transaction;
  }

  /**
   * Builds a transaction to perform a swap in the pool.
   * @param {SwapParams} params - Parameters for swapping tokens.
   * @returns Transaction builder.
   */
  async swap(params: SwapParams): TxBuilder {
    const {
      payer,
      pool,
      inputTokenMint,
      outputTokenMint,
      amountIn,
      minimumAmountOut,
      tokenAVault,
      tokenBVault,
      tokenAMint,
      tokenBMint,
      tokenAProgram,
      tokenBProgram,
      referralTokenAccount,
    } = params;

    const [inputTokenProgram, outputTokenProgram] = inputTokenMint.equals(
      tokenAMint
    )
      ? [tokenAProgram, tokenBProgram]
      : [tokenBProgram, tokenAProgram];

    const {
      tokenAAta: inputTokenAccount,
      tokenBAta: outputTokenAccount,
      instructions: preInstructions,
    } = await this.prepareTokenAccounts({
      payer,
      tokenAOwner: payer,
      tokenBOwner: payer,
      tokenAMint: inputTokenMint,
      tokenBMint: outputTokenMint,
      tokenAProgram: inputTokenProgram,
      tokenBProgram: outputTokenProgram,
    });

    if (inputTokenMint.equals(NATIVE_MINT)) {
      const wrapSOLIx = wrapSOLInstruction(
        payer,
        inputTokenAccount,
        BigInt(amountIn.toString())
      );

      preInstructions.push(...wrapSOLIx);
    }

    const postInstructions: TransactionInstruction[] = [];
    if (
      [tokenAMint.toBase58(), tokenBMint.toBase58()].includes(
        NATIVE_MINT.toBase58()
      )
    ) {
      const closeWrappedSOLIx = await unwrapSOLInstruction(payer);
      closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
    }

    return await this._program.methods
      .swap({
        amountIn,
        minimumAmountOut,
      })
      .accountsPartial({
        poolAuthority: this.poolAuthority,
        pool,
        payer,
        inputTokenAccount,
        outputTokenAccount,
        tokenAVault,
        tokenBVault,
        tokenAMint,
        tokenBMint,
        tokenAProgram,
        tokenBProgram,
        referralTokenAccount,
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .transaction();
  }

  /**
   * Builds a transaction to lock a position with vesting schedule.
   * @param {LockPositionParams} params - Locking parameters.
   * @returns Transaction builder.
   */
  async lockPosition(params: LockPositionParams): TxBuilder {
    const {
      owner,
      pool,
      payer,
      vestingAccount,
      position,
      positionNftAccount,
      cliffPoint,
      periodFrequency,
      cliffUnlockLiquidity,
      liquidityPerPeriod,
      numberOfPeriod,
    } = params;
    const lockPositionParams = {
      cliffPoint,
      periodFrequency,
      cliffUnlockLiquidity,
      liquidityPerPeriod,
      numberOfPeriod,
    };
    return await this._program.methods
      .lockPosition(lockPositionParams)
      .accountsPartial({
        position,
        positionNftAccount,
        vesting: vestingAccount,
        pool: pool,
        owner: owner,
        payer: payer,
        systemProgram: SystemProgram.programId,
      })
      .transaction();
  }

  /**
   * Builds a transaction to permanently lock a position.
   * @param {PermanentLockParams} params - Parameters for permanent locking.
   * @returns Transaction builder.
   */
  async permanentLockPosition(params: PermanentLockParams): TxBuilder {
    const { owner, position, positionNftAccount, pool, unlockedLiquidity } =
      params;

    return await this._program.methods
      .permanentLockPosition(unlockedLiquidity)
      .accountsPartial({
        position,
        positionNftAccount,
        pool: pool,
        owner: owner,
      })
      .transaction();
  }

  /**
   * Builds a transaction to refresh vesting status of a position.
   * @param {RefreshVestingParams} params - Refresh vesting parameters.
   * @returns Transaction builder.
   */
  async refreshVesting(params: RefreshVestingParams): TxBuilder {
    const instruction = await this.buildRefreshVestingInstruction(params);

    return new Transaction().add(instruction);
  }

  async closePosition(params: ClosePositionParams): TxBuilder {
    const { owner, pool, position, positionNftMint, positionNftAccount } =
      params;

    const instruction = await this.buildClosePositionInstruction({
      owner,
      poolAuthority: this.poolAuthority,
      pool,
      position,
      positionNftMint,
      positionNftAccount,
    });

    return new Transaction().add(instruction);
  }

  /**
   * Builds a transaction to remove all liquidity from a position and close it.
   * This combines several operations in a single transaction:
   * 1. Claims any accumulated fees
   * 2. Removes all liquidity
   * 3. Closes the position
   *
   * @param {RemoveAllLiquidityAndClosePositionParams} params - Combined parameters
   * @returns {TxBuilder} Transaction builder with all required instructions
   * @throws {Error} If the position is locked or cannot be closed
   */
  async removeAllLiquidityAndClosePosition(
    params: RemoveAllLiquidityAndClosePositionParams
  ): TxBuilder {
    const {
      owner,
      position,
      positionNftAccount,
      positionState,
      poolState,
      tokenAAmountThreshold,
      tokenBAmountThreshold,
      vestings,
      currentPoint,
    } = params;

    const { pool } = positionState;
    const { tokenAMint, tokenBMint } = poolState;

    const { canUnlock, reason } = this.canUnlockPosition(
      positionState,
      vestings,
      currentPoint
    );

    if (!canUnlock) {
      throw new Error(`Cannot remove liquidity: ${reason}`);
    }

    const tokenAProgram = getTokenProgram(poolState.tokenAFlag);
    const tokenBProgram = getTokenProgram(poolState.tokenBFlag);

    const {
      tokenAAta: tokenAAccount,
      tokenBAta: tokenBAccount,
      instructions: preInstructions,
    } = await this.prepareTokenAccounts({
      payer: owner,
      tokenAOwner: owner,
      tokenBOwner: owner,
      tokenAMint,
      tokenBMint,
      tokenAProgram,
      tokenBProgram,
    });

    const postInstructions: TransactionInstruction[] = [];
    if (
      [tokenAMint.toBase58(), tokenBMint.toBase58()].includes(
        NATIVE_MINT.toBase58()
      )
    ) {
      const closeWrappedSOLIx = await unwrapSOLInstruction(owner);
      closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
    }

    // 1. refresh vesting if vesting account provided
    if (vestings.length > 0) {
      const refreshVestingInstruction =
        await this.buildRefreshVestingInstruction({
          owner,
          position,
          positionNftAccount,
          pool,
          vestingAccounts: vestings.map((item) => item.account),
        });

      refreshVestingInstruction &&
        preInstructions.push(refreshVestingInstruction);
    }

    const transaction = new Transaction();

    if (preInstructions.length > 0) {
      transaction.add(...preInstructions);
    }

    // 2. claim fee, remove liquidity and close position
    const liquidatePositionInstructions =
      await this.buildLiquidatePositionInstruction({
        owner,
        position,
        positionNftAccount,
        positionState,
        poolState,
        tokenAAccount,
        tokenBAccount,
        tokenAAmountThreshold,
        tokenBAmountThreshold,
      });

    transaction.add(...liquidatePositionInstructions);

    if (postInstructions.length > 0) {
      transaction.add(...postInstructions);
    }

    return transaction;
  }

  /**
   * Builds a transaction to merge liquidity from one position into another.
   * This process:
   * 1. Claims fees from the source position
   * 2. Removes all liquidity from the source position
   * 3. Adds that liquidity to the target position
   * 4. Closes the source position
   *
   * @param {MergePositionParams} params - Parameters for merging positions
   * @returns {TxBuilder} Transaction builder with all required instructions
   * @throws {Error} If either position is locked or incompatible
   */
  async mergePosition(params: MergePositionParams): TxBuilder {
    const {
      owner,
      positionA,
      positionB,
      positionBState,
      poolState,
      positionBNftAccount,
      positionANftAccount,
      tokenAAmountAddLiquidityThreshold,
      tokenBAmountAddLiquidityThreshold,
      tokenAAmountRemoveLiquidityThreshold,
      tokenBAmountRemoveLiquidityThreshold,
      positionBVestings,
      currentPoint,
    } = params;

    const { canUnlock, reason } = this.canUnlockPosition(
      positionBState,
      positionBVestings,
      currentPoint
    );

    if (!canUnlock) {
      throw new Error(`Cannot remove liquidity: ${reason}`);
    }

    const pool = positionBState.pool;
    const { tokenAMint, tokenBMint, tokenAVault, tokenBVault } = poolState;

    const tokenAProgram = getTokenProgram(poolState.tokenAFlag);
    const tokenBProgram = getTokenProgram(poolState.tokenBFlag);

    const {
      tokenAAta: tokenAAccount,
      tokenBAta: tokenBAccount,
      instructions: preInstructions,
    } = await this.prepareTokenAccounts({
      payer: owner,
      tokenAOwner: owner,
      tokenBOwner: owner,
      tokenAMint,
      tokenBMint,
      tokenAProgram,
      tokenBProgram,
    });

    let positionBLiquidityDelta = positionBState.unlockedLiquidity;
    // 1. refresh vesting position B if vesting account provided
    if (positionBVestings.length > 0) {
      // accumulate all liquidity delta of position b (unlocked + available vesting)
      const totalAvailableVestingLiquidity = positionBVestings.reduce(
        (total, position) => {
          const available = getAvailableVestingLiquidity(
            position.vestingState,
            currentPoint
          );
          return total.add(available);
        },
        new BN(0)
      );

      positionBLiquidityDelta = positionBLiquidityDelta.add(
        totalAvailableVestingLiquidity
      );

      const refreshVestingInstruction =
        await this.buildRefreshVestingInstruction({
          owner,
          position: positionB,
          positionNftAccount: positionBNftAccount,
          pool,
          vestingAccounts: positionBVestings.map((item) => item.account),
        });
      refreshVestingInstruction &&
        preInstructions.push(refreshVestingInstruction);
    }

    // recalculate liquidity delta
    const tokenAWithdrawAmount = getAmountAFromLiquidityDelta(
      positionBLiquidityDelta,
      poolState.sqrtPrice,
      poolState.sqrtMaxPrice,
      Rounding.Down
    );

    const tokenBWithdrawAmount = getAmountBFromLiquidityDelta(
      positionBLiquidityDelta,
      poolState.sqrtPrice,
      poolState.sqrtMinPrice,
      Rounding.Down
    );

    const newLiquidityDelta = this.getLiquidityDelta({
      maxAmountTokenA: tokenAWithdrawAmount,
      maxAmountTokenB: tokenBWithdrawAmount,
      sqrtMaxPrice: poolState.sqrtMaxPrice,
      sqrtMinPrice: poolState.sqrtMinPrice,
      sqrtPrice: poolState.sqrtPrice,
    });

    const transaction = new Transaction();

    if (preInstructions.length > 0) {
      transaction.add(...preInstructions);
    }

    // 2. claim fee, remove liquidity and close position
    const liquidatePositionInstructions =
      await this.buildLiquidatePositionInstruction({
        owner,
        position: positionB,
        positionNftAccount: positionBNftAccount,
        positionState: positionBState,
        poolState,
        tokenAAccount,
        tokenBAccount,
        tokenAAmountThreshold: tokenAAmountRemoveLiquidityThreshold,
        tokenBAmountThreshold: tokenBAmountRemoveLiquidityThreshold,
      });

    transaction.add(...liquidatePositionInstructions);

    // 3. add liquidity from position B to positon A
    const addLiquidityInstruction = await this.buildAddLiquidityInstruction({
      pool,
      position: positionA,
      positionNftAccount: positionANftAccount,
      owner,
      tokenAAccount,
      tokenBAccount,
      tokenAMint,
      tokenBMint,
      tokenAVault,
      tokenBVault,
      tokenAProgram,
      tokenBProgram,
      liquidityDelta: newLiquidityDelta,
      tokenAAmountThreshold: tokenAAmountAddLiquidityThreshold,
      tokenBAmountThreshold: tokenBAmountAddLiquidityThreshold,
    });

    transaction.add(addLiquidityInstruction);

    if (
      [tokenAMint.toBase58(), tokenBMint.toBase58()].includes(
        NATIVE_MINT.toBase58()
      )
    ) {
      const closeWrappedSOLIx = await unwrapSOLInstruction(owner);
      closeWrappedSOLIx && transaction.add(closeWrappedSOLIx);
    }

    return transaction;
  }

  /**
   * Builds a transaction to update reward duration.
   * @param {UpdateRewardDurationParams} params - Parameters including pool and new duration.
   * @returns Transaction builder.
   */
  async updateRewardDuration(params: UpdateRewardDurationParams): TxBuilder {
    const { pool, admin, rewardIndex, newDuration } = params;
    return await this._program.methods
      .updateRewardDuration(rewardIndex, newDuration)
      .accountsPartial({
        pool,
        admin: admin,
      })
      .transaction();
  }

  /**
   * Builds a transaction to update reward funder address.
   * @param {UpdateRewardFunderParams} params - Parameters including pool and new funder address.
   * @returns Transaction builder.
   */
  async updateRewardFunder(params: UpdateRewardFunderParams): TxBuilder {
    const { pool, admin, rewardIndex, newFunder } = params;
    return await this._program.methods
      .updateRewardFunder(rewardIndex, newFunder)
      .accountsPartial({
        pool,
        admin: admin,
      })
      .transaction();
  }

  /**
   * Builds a transaction to fund rewards in a pool.
   * @param {FundRewardParams} params - Funding parameters.
   * @returns Transaction builder.
   */
  async fundReward(params: FundRewardParams): TxBuilder {
    const { rewardIndex, carryForward, pool, funder, amount } = params;

    const poolState = await this.fetchPoolState(pool);
    const rewardInfo = poolState.rewardInfos[rewardIndex];
    const { vault, mint } = rewardInfo;
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

    return await this._program.methods
      .fundReward(rewardIndex, amount, carryForward)
      .accountsPartial({
        pool,
        rewardVault: vault,
        rewardMint: mint,
        funderTokenAccount,
        funder: funder,
        tokenProgram,
      })
      .transaction();
  }

  /**
   * Builds a transaction to withdraw ineligible rewards from a pool.
   * @param {WithdrawIneligibleRewardParams} params - Parameters for withdrawal.
   * @returns Transaction builder.
   */
  async withdrawIneligibleReward(
    params: WithdrawIneligibleRewardParams
  ): TxBuilder {
    const { rewardIndex, pool, funder } = params;
    const poolState = await this.fetchPoolState(pool);

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

    return await this._program.methods
      .withdrawIneligibleReward(rewardIndex)
      .accountsPartial({
        pool,
        rewardVault: vault,
        rewardMint: mint,
        poolAuthority: this.poolAuthority,
        funderTokenAccount,
        funder: funder,
        tokenProgram,
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .transaction();
  }

  /**
   * Builds a transaction to claim partner fee rewards.
   * @param {ClaimPartnerFeeParams} params - Claim parameters including amounts and partner address.
   * @returns Transaction builder.
   */
  async claimPartnerFee(params: ClaimPartnerFeeParams): TxBuilder {
    const {
      feePayer,
      receiver,
      tempWSolAccount,
      partner,
      pool,
      maxAmountA,
      maxAmountB,
    } = params;
    const poolState = await this.fetchPoolState(pool);
    const {
      tokenAVault,
      tokenBVault,
      tokenAMint,
      tokenBMint,
      tokenAFlag,
      tokenBFlag,
    } = poolState;

    const tokenAProgram = getTokenProgram(tokenAFlag);
    const tokenBProgram = getTokenProgram(tokenBFlag);

    const payer = feePayer ?? partner;
    const { tokenAAccount, tokenBAccount, preInstructions, postInstructions } =
      await this.setupFeeClaimAccounts({
        payer,
        owner: partner,
        tokenAMint,
        tokenBMint,
        tokenAProgram,
        tokenBProgram,
        receiver,
        tempWSolAccount,
      });

    return await this._program.methods
      .claimPartnerFee(maxAmountA, maxAmountB)
      .accountsPartial({
        poolAuthority: this.poolAuthority,
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
      .transaction();
  }

  /**
   * Builds a transaction to claim position fee rewards.
   * @param {ClaimPositionFeeParams} params - Parameters for claiming position fee.
   * @returns Transaction builder.
   */
  async claimPositionFee(params: ClaimPositionFeeParams): TxBuilder {
    const {
      receiver,
      tempWSolAccount,
      feePayer,
      owner,
      pool,
      position,
      positionNftAccount,
      tokenAVault,
      tokenBVault,
      tokenAMint,
      tokenBMint,
      tokenAProgram,
      tokenBProgram,
    } = params;

    const payer = feePayer ?? owner;
    const { tokenAAccount, tokenBAccount, preInstructions, postInstructions } =
      await this.setupFeeClaimAccounts({
        payer,
        owner,
        tokenAMint,
        tokenBMint,
        tokenAProgram,
        tokenBProgram,
        receiver,
        tempWSolAccount,
      });
    const claimPositionFeeInstruction =
      await this.buildClaimPositionFeeInstruction({
        owner,
        poolAuthority: this.poolAuthority,
        pool,
        position,
        positionNftAccount,
        tokenAAccount,
        tokenBAccount,
        tokenAVault,
        tokenBVault,
        tokenAMint,
        tokenBMint,
        tokenAProgram,
        tokenBProgram,
      });

    const transaction = new Transaction();
    transaction.add(
      ...(preInstructions.length > 0 ? preInstructions : []),
      claimPositionFeeInstruction,
      ...(postInstructions.length > 0 ? postInstructions : [])
    );

    return transaction;
  }

  /**
   * Builds a transaction to claim reward from a position.
   * @param {ClaimRewardParams} params - Parameters for claiming reward.
   * @returns Transaction builder.
   */
  async claimReward(params: ClaimRewardParams): TxBuilder {
    const {
      feePayer,
      user,
      position,
      positionNftAccount,
      rewardIndex,
      poolState,
      positionState,
    } = params;

    const rewardInfo = poolState.rewardInfos[rewardIndex];
    const tokenProgram = getTokenProgram(rewardInfo.rewardTokenFlag);

    const preInstructions: TransactionInstruction[] = [];
    const postInstructions: TransactionInstruction[] = [];
    const { ataPubkey: userTokenAccount, ix: createUserTokenAccountIx } =
      await getOrCreateATAInstruction(
        this._program.provider.connection,
        rewardInfo.mint,
        user,
        feePayer ?? user,
        true,
        tokenProgram
      );
    createUserTokenAccountIx && preInstructions.push(createUserTokenAccountIx);

    if (rewardInfo.mint.equals(NATIVE_MINT)) {
      const closeWrappedSOLIx = await unwrapSOLInstruction(user);
      closeWrappedSOLIx && postInstructions.push(closeWrappedSOLIx);
    }
    return await this._program.methods
      .claimReward(rewardIndex)
      .accountsPartial({
        pool: positionState.pool,
        positionNftAccount,
        rewardVault: rewardInfo.vault,
        rewardMint: rewardInfo.mint,
        poolAuthority: this.poolAuthority,
        position,
        userTokenAccount,
        owner: user,
        tokenProgram,
      })
      .preInstructions(preInstructions)
      .postInstructions(postInstructions)
      .transaction();
  }
}
