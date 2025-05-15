import { ProgramTestContext } from "solana-bankrun";
import {
  executeTransaction,
  getPool,
  setupTestContext,
  startTest,
  transferSol,
} from "./bankrun-utils/common";
import {
  clusterApiUrl,
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
} from "@solana/web3.js";
import BN from "bn.js";
import { NATIVE_MINT, TOKEN_PROGRAM_ID } from "@solana/spl-token";

import {
  BaseFee,
  CpAmm,
  derivePositionNftAccount,
  getTokenProgram,
  InitializeCustomizeablePoolParams,
  MAX_SQRT_PRICE,
  MIN_SQRT_PRICE,
  PoolFeesParams,
  PoolState,
} from "../src";
import { DECIMALS } from "./bankrun-utils";

describe("Claim Fee", () => {
  let context: ProgramTestContext;
  let payer: Keypair;
  let tokenX: PublicKey;
  let tokenY: PublicKey;
  let ammInstance: CpAmm;
  let poolAddress: PublicKey;
  let positionAddress: PublicKey;
  let positionNftMint: PublicKey;
  let tempWSolAccountKP: Keypair;
  let recipientKP: Keypair;
  let poolState: PoolState;

  beforeEach(async () => {
    context = await startTest();
    const prepareContext = await setupTestContext(
      context.banksClient,
      context.payer,
      false
    );
    tempWSolAccountKP = Keypair.generate();
    recipientKP = Keypair.generate();
    await transferSol(
      context.banksClient,
      context.payer,
      tempWSolAccountKP.publicKey,
      new BN(LAMPORTS_PER_SOL)
    );

    await transferSol(
      context.banksClient,
      context.payer,
      recipientKP.publicKey,
      new BN(LAMPORTS_PER_SOL)
    );

    payer = prepareContext.payer;
    tokenX = prepareContext.tokenAMint;
    tokenY = NATIVE_MINT;
    const connection = new Connection(clusterApiUrl("devnet"));
    ammInstance = new CpAmm(connection);

    const baseFee: BaseFee = {
      cliffFeeNumerator: new BN(500_000_000), // 50%
      numberOfPeriod: 10,
      periodFrequency: new BN(10),
      reductionFactor: new BN(2),
      feeSchedulerMode: 0, // Linear
    };
    const poolFees: PoolFeesParams = {
      baseFee,
      protocolFeePercent: 20,
      partnerFeePercent: 0,
      referralFeePercent: 20,
      dynamicFee: null,
    };

    const positionNft = Keypair.generate();

    const tokenAAmount = new BN(1_000_000 * 10 ** DECIMALS);
    const tokenBAmount = new BN(100 * 10 ** DECIMALS);
    const { liquidityDelta: initPoolLiquidityDelta, initSqrtPrice } =
      ammInstance.preparePoolCreationParams({
        tokenAAmount,
        tokenBAmount,
        minSqrtPrice: MIN_SQRT_PRICE,
        maxSqrtPrice: MAX_SQRT_PRICE,
      });

    const params: InitializeCustomizeablePoolParams = {
      payer: payer.publicKey,
      creator: payer.publicKey,
      positionNft: positionNft.publicKey,
      tokenAMint: tokenX,
      tokenBMint: tokenY,
      tokenAAmount,
      tokenBAmount,
      sqrtMinPrice: MIN_SQRT_PRICE,
      sqrtMaxPrice: MAX_SQRT_PRICE,
      liquidityDelta: initPoolLiquidityDelta,
      initSqrtPrice,
      poolFees,
      hasAlphaVault: false,
      activationType: 1, // 0 slot, 1 timestamp
      collectFeeMode: 1,
      activationPoint: null,
      tokenAProgram: TOKEN_PROGRAM_ID,
      tokenBProgram: TOKEN_PROGRAM_ID,
    };

    const {
      tx: transaction,
      pool,
      position,
    } = await ammInstance.createCustomPool(params);
    poolAddress = pool;
    positionAddress = position;
    positionNftMint = positionNft.publicKey;

    await executeTransaction(context.banksClient, transaction, [
      payer,
      positionNft,
    ]);

    poolState = await getPool(
      context.banksClient,
      ammInstance._program,
      poolAddress
    );
  });

  it("Claim position fee to owner", async () => {
    // swap A -> B
    const swapAtoBTx = await ammInstance.swap({
      payer: payer.publicKey,
      pool: poolAddress,
      inputTokenMint: poolState.tokenAMint,
      outputTokenMint: poolState.tokenBMint,
      amountIn: new BN(100_000 * 10 ** DECIMALS),
      minimumAmountOut: new BN(0),
      tokenAMint: poolState.tokenAMint,
      tokenBMint: poolState.tokenBMint,
      tokenAVault: poolState.tokenAVault,
      tokenBVault: poolState.tokenBVault,
      tokenAProgram: getTokenProgram(poolState.tokenAFlag),
      tokenBProgram: getTokenProgram(poolState.tokenBFlag),
      referralTokenAccount: null,
    });
    executeTransaction(context.banksClient, swapAtoBTx, [payer]);

    // claim position fee
    const claimFeeTx = await ammInstance.claimPositionFee({
      specifiedReceiver: undefined,
      feePayer: payer.publicKey,
      owner: payer.publicKey,
      pool: poolAddress,
      position: positionAddress,
      positionNftAccount: derivePositionNftAccount(positionNftMint),
      tokenAMint: poolState.tokenAMint,
      tokenBMint: poolState.tokenBMint,
      tokenAVault: poolState.tokenAVault,
      tokenBVault: poolState.tokenBVault,
      tokenAProgram: getTokenProgram(poolState.tokenAFlag),
      tokenBProgram: getTokenProgram(poolState.tokenBFlag),
    });
    executeTransaction(context.banksClient, claimFeeTx, [payer]);
  });

  it("Claim position fee to specified receiver", async () => {
    // swap A -> B
    const swapAtoBTx = await ammInstance.swap({
      payer: payer.publicKey,
      pool: poolAddress,
      inputTokenMint: poolState.tokenAMint,
      outputTokenMint: poolState.tokenBMint,
      amountIn: new BN(100_000 * 10 ** DECIMALS),
      minimumAmountOut: new BN(0),
      tokenAMint: poolState.tokenAMint,
      tokenBMint: poolState.tokenBMint,
      tokenAVault: poolState.tokenAVault,
      tokenBVault: poolState.tokenBVault,
      tokenAProgram: getTokenProgram(poolState.tokenAFlag),
      tokenBProgram: getTokenProgram(poolState.tokenBFlag),
      referralTokenAccount: null,
    });
    executeTransaction(context.banksClient, swapAtoBTx, [payer]);

    // claim position fee
    const claimFeeReceiverTx = await ammInstance.claimPositionFee({
      specifiedReceiver: {
        tempWSolAccount: tempWSolAccountKP.publicKey,
        recipient: recipientKP.publicKey,
      },
      feePayer: payer.publicKey,
      owner: payer.publicKey,
      pool: poolAddress,
      position: positionAddress,
      positionNftAccount: derivePositionNftAccount(positionNftMint),
      tokenAMint: poolState.tokenAMint,
      tokenBMint: poolState.tokenBMint,
      tokenAVault: poolState.tokenAVault,
      tokenBVault: poolState.tokenBVault,
      tokenAProgram: getTokenProgram(poolState.tokenAFlag),
      tokenBProgram: getTokenProgram(poolState.tokenBFlag),
    });
    executeTransaction(context.banksClient, claimFeeReceiverTx, [
      payer,
      tempWSolAccountKP,
    ]);
  });
});
