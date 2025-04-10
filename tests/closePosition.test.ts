import { ProgramTestContext } from "solana-bankrun";
import {
  executeTransaction,
  getPool,
  getPosition,
  setupTestContext,
  startTest,
} from "./bankrun-utils/common";
import { clusterApiUrl, Connection, Keypair, PublicKey } from "@solana/web3.js";
import BN from "bn.js";
import {
  AccountLayout,
  ExtensionType,
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

import {
  AddLiquidityParams,
  BaseFee,
  CpAmm,
  getTokenProgram,
  InitializeCustomizeablePoolParams,
  MAX_SQRT_PRICE,
  MIN_SQRT_PRICE,
  PoolFeesParams,
} from "../src";
import { DECIMALS, U64_MAX } from "./bankrun-utils";

describe("Remove liquidity & Close position", () => {
  describe("Remove all liquidity and close position with SPL-Token", () => {
    let context: ProgramTestContext;
    let payer: Keypair;
    let creator: Keypair;
    let tokenX: PublicKey;
    let tokenY: PublicKey;
    let ammInstance: CpAmm;

    beforeEach(async () => {
      context = await startTest();
      const prepareContext = await setupTestContext(
        context.banksClient,
        context.payer,
        false
      );

      creator = prepareContext.poolCreator;
      payer = prepareContext.payer;
      tokenX = prepareContext.tokenAMint;
      tokenY = prepareContext.tokenBMint;
      const connection = new Connection(clusterApiUrl("devnet"));
      ammInstance = new CpAmm(connection);
    });

    it("Success case", async () => {
      const baseFee: BaseFee = {
        cliffFeeNumerator: new BN(1_000_000), // 1%
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

      const params: InitializeCustomizeablePoolParams = {
        payer: payer.publicKey,
        creator: creator.publicKey,
        positionNft: positionNft.publicKey,
        tokenAMint: tokenX,
        tokenBMint: tokenY,
        tokenAAmount: new BN(1000 * 10 ** DECIMALS),
        tokenBAmount: new BN(1000 * 10 ** DECIMALS),
        minSqrtPrice: MIN_SQRT_PRICE,
        maxSqrtPrice: MAX_SQRT_PRICE,
        tokenADecimal: DECIMALS,
        tokenBDecimal: DECIMALS,
        poolFees,
        hasAlphaVault: false,
        activationType: 1, // 0 slot, 1 timestamp
        collectFeeMode: 0,
        activationPoint: null,
        tokenAProgram: TOKEN_PROGRAM_ID,
        tokenBProgram: TOKEN_PROGRAM_ID,
      };

      const {
        tx: transaction,
        pool,
        position,
      } = await ammInstance.createCustomPool(params);

      await executeTransaction(context.banksClient, transaction, [
        payer,
        positionNft,
      ]);

      // add liquidity
      const poolState = await getPool(
        context.banksClient,
        ammInstance.getProgram(),
        pool
      );
      const liquidityDelta = await ammInstance.getLiquidityDelta({
        maxAmountTokenA: new BN(1000 * 10 ** DECIMALS),
        maxAmountTokenB: new BN(1000 * 10 ** DECIMALS),
        tokenAMint: poolState.tokenAMint,
        tokenBMint: poolState.tokenBMint,
        sqrtPrice: poolState.sqrtPrice,
        sqrtMinPrice: poolState.sqrtMinPrice,
        sqrtMaxPrice: poolState.sqrtMaxPrice,
      });

      const addLiquidityParams: AddLiquidityParams = {
        owner: creator.publicKey,
        pool,
        position,
        positionNftMint: positionNft.publicKey,
        liquidityDeltaQ64: liquidityDelta,
        maxAmountTokenA: new BN(1000 * 10 ** DECIMALS),
        maxAmountTokenB: new BN(1000 * 10 ** DECIMALS),
        tokenAAmountThreshold: new BN(U64_MAX),
        tokenBAmountThreshold: new BN(U64_MAX),
        tokenAMint: poolState.tokenAMint,
        tokenBMint: poolState.tokenBMint,
        tokenAVault: poolState.tokenAVault,
        tokenBVault: poolState.tokenBVault,
        tokenAProgram: getTokenProgram(poolState.tokenAFlag),
        tokenBProgram: getTokenProgram(poolState.tokenBFlag),
      };
      const addLiquidityTx = await ammInstance.addLiquidity(addLiquidityParams);
      executeTransaction(context.banksClient, addLiquidityTx, [creator]);

      const removeLiquidityParams = addLiquidityParams;
      // remove all liquidity
      removeLiquidityParams.tokenAAmountThreshold = new BN(0);
      removeLiquidityParams.tokenBAmountThreshold = new BN(0);

      const removeAllLiquidityTx = await ammInstance.removeAllLiquidity(
        removeLiquidityParams
      );

      executeTransaction(context.banksClient, removeAllLiquidityTx, [creator]);

      // close position
      const closePositionTx = await ammInstance.closePosition({
        owner: creator.publicKey,
        pool,
        position,
        positionNftMint: positionNft.publicKey,
      });
      executeTransaction(context.banksClient, closePositionTx, [creator]);
    });
  });

  describe("Remove all liquidity and close position with Token 2022", () => {
    let context: ProgramTestContext;
    let payer: Keypair;
    let creator: Keypair;
    let tokenX: PublicKey;
    let tokenY: PublicKey;
    let ammInstance: CpAmm;

    beforeEach(async () => {
      context = await startTest();
      const extensions = [ExtensionType.TransferFeeConfig];
      const prepareContext = await setupTestContext(
        context.banksClient,
        context.payer,
        true,
        extensions
      );

      creator = prepareContext.poolCreator;
      payer = prepareContext.payer;
      tokenX = prepareContext.tokenAMint;
      tokenY = prepareContext.tokenBMint;

      const connection = new Connection(clusterApiUrl("devnet"));
      ammInstance = new CpAmm(connection);
    });

    it("Success case", async () => {
      const baseFee: BaseFee = {
        cliffFeeNumerator: new BN(1_000_000), // 1%
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

      const params: InitializeCustomizeablePoolParams = {
        payer: payer.publicKey,
        creator: creator.publicKey,
        positionNft: positionNft.publicKey,
        tokenAMint: tokenX,
        tokenBMint: tokenY,
        tokenAAmount: new BN(1000 * 10 ** DECIMALS),
        tokenBAmount: new BN(1000 * 10 ** DECIMALS),
        minSqrtPrice: MIN_SQRT_PRICE,
        maxSqrtPrice: MAX_SQRT_PRICE,
        tokenADecimal: DECIMALS,
        tokenBDecimal: DECIMALS,
        poolFees,
        hasAlphaVault: false,
        activationType: 1, // 0 slot, 1 timestamp
        collectFeeMode: 0,
        activationPoint: null,
        tokenAProgram: TOKEN_2022_PROGRAM_ID,
        tokenBProgram: TOKEN_2022_PROGRAM_ID,
      };

      const {
        tx: transaction,
        pool,
        position,
      } = await ammInstance.createCustomPool(params);

      await executeTransaction(context.banksClient, transaction, [
        payer,
        positionNft,
      ]);

      const poolState = await getPool(
        context.banksClient,
        ammInstance.getProgram(),
        pool
      );
      const liquidityDelta = await ammInstance.getLiquidityDelta({
        maxAmountTokenA: new BN(1000 * 10 ** DECIMALS),
        maxAmountTokenB: new BN(1000 * 10 ** DECIMALS),
        tokenAMint: poolState.tokenAMint,
        tokenBMint: poolState.tokenBMint,
        sqrtPrice: poolState.sqrtPrice,
        sqrtMinPrice: poolState.sqrtMinPrice,
        sqrtMaxPrice: poolState.sqrtMaxPrice,
      });

      const addLiquidityParams: AddLiquidityParams = {
        owner: creator.publicKey,
        position,
        pool,
        positionNftMint: positionNft.publicKey,
        liquidityDeltaQ64: liquidityDelta,
        maxAmountTokenA: new BN(1000 * 10 ** DECIMALS),
        maxAmountTokenB: new BN(1000 * 10 ** DECIMALS),
        tokenAAmountThreshold: new BN(U64_MAX),
        tokenBAmountThreshold: new BN(U64_MAX),
        tokenAMint: poolState.tokenAMint,
        tokenBMint: poolState.tokenBMint,
        tokenAVault: poolState.tokenAVault,
        tokenBVault: poolState.tokenBVault,
        tokenAProgram: getTokenProgram(poolState.tokenAFlag),
        tokenBProgram: getTokenProgram(poolState.tokenBFlag),
      };
      const addLiquidityTx = await ammInstance.addLiquidity(addLiquidityParams);
      executeTransaction(context.banksClient, addLiquidityTx, [creator]);

      // remove liquidiy
      const removeLiquidityParams = addLiquidityParams;
      removeLiquidityParams.tokenAAmountThreshold = new BN(0);
      removeLiquidityParams.tokenBAmountThreshold = new BN(0);

      const removeAllLiquidityTx = await ammInstance.removeAllLiquidity(
        removeLiquidityParams
      );

      executeTransaction(context.banksClient, removeAllLiquidityTx, [creator]);

      // close position
      const closePositionTx = await ammInstance.closePosition({
        owner: creator.publicKey,
        pool,
        position,
        positionNftMint: positionNft.publicKey,
      });
      executeTransaction(context.banksClient, closePositionTx, [creator]);
    });
  });
});
