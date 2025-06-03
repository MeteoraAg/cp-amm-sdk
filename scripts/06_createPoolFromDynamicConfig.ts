import {
  clusterApiUrl,
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  CpAmm,
  FeeSchedulerMode,
  getAmountAFromLiquidityDelta,
  getAmountBFromLiquidityDelta,
  getBaseFeeParams,
  getDynamicFeeParams,
  getSqrtPriceFromPrice,
  InitializeCustomizeablePoolWithDynamicConfigParams,
  PoolFeesParams,
  Rounding,
} from "../src";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import fs from "fs";
import poolConfig from "./config/concentrated_pool/eurc_usdc.json";

(async () => {
  const wallet = Keypair.fromSecretKey(
    Uint8Array.from(require("~/.config/solana/id.json"))
  );

  const connection = new Connection(clusterApiUrl("mainnet-beta"));
  const cpAmm = new CpAmm(connection);

  const confgAccount = new PublicKey(
    "3G5CDs8T8A7hyxJFvdgqmaAVN29TXJoL8ToEgQySeHgq"
  );

  const maxAmountTokenA = new BN(
    poolConfig.maxTokenAAmount * 10 ** poolConfig.tokenADecimal
  );
  const maxAmountTokenB = new BN(
    poolConfig.maxTokenBAmount * 10 ** poolConfig.tokenBDecimal
  );
  const sqrtPrice = getSqrtPriceFromPrice(
    poolConfig.initPrice.toString(),
    poolConfig.tokenADecimal,
    poolConfig.tokenBDecimal
  );
  const sqrtMinPrice = getSqrtPriceFromPrice(
    poolConfig.minPrice.toString(),
    poolConfig.tokenADecimal,
    poolConfig.tokenBDecimal
  );
  const sqrtMaxPrice = getSqrtPriceFromPrice(
    poolConfig.maxPrice.toString(),
    poolConfig.tokenADecimal,
    poolConfig.tokenBDecimal
  );

  const liquidityDelta = cpAmm.getLiquidityDelta({
    maxAmountTokenA,
    maxAmountTokenB,
    sqrtMaxPrice,
    sqrtMinPrice,
    sqrtPrice,
  });

  const { outputAmount } = cpAmm.getDepositQuote({
    inAmount: maxAmountTokenA,
    isTokenA: true,
    minSqrtPrice: sqrtMinPrice,
    maxSqrtPrice: sqrtMaxPrice,
    sqrtPrice,
  });

  console.log({ outputAmount: outputAmount.toString() });

  const baseFeeParams = getBaseFeeParams(
    poolConfig.baseFee,
    poolConfig.baseFee,
    FeeSchedulerMode.Linear,
    0,
    0
  );

  const dynamicFeeParams = getDynamicFeeParams(poolConfig.baseFee);

  const tokenADepositToPool = getAmountAFromLiquidityDelta(
    liquidityDelta,
    sqrtPrice,
    sqrtMaxPrice,
    Rounding.Up
  ).toString();

  const tokenBDepositToPool = getAmountBFromLiquidityDelta(
    liquidityDelta,
    sqrtPrice,
    sqrtMinPrice,
    Rounding.Up
  );

  console.log({
    tokenADepositToPool: tokenADepositToPool.toString(),
    tokenBDepositToPool: tokenBDepositToPool.toString(),
  });

  const poolFees: PoolFeesParams = {
    baseFee: baseFeeParams,
    protocolFeePercent: 20,
    partnerFeePercent: 0,
    referralFeePercent: 20,
    dynamicFee: dynamicFeeParams,
  };

  //
  const positionNft = Keypair.generate();
  const createPoolParams: InitializeCustomizeablePoolWithDynamicConfigParams = {
    creator: wallet.publicKey,
    payer: wallet.publicKey,
    config: confgAccount,
    poolCreatorAuthority: wallet.publicKey,
    positionNft: positionNft.publicKey,
    tokenAMint: new PublicKey(poolConfig.tokenAMint),
    tokenBMint: new PublicKey(poolConfig.tokenBMint),
    tokenAAmount: maxAmountTokenA,
    tokenBAmount: maxAmountTokenB,
    initSqrtPrice: sqrtPrice,
    poolFees,
    sqrtMinPrice,
    sqrtMaxPrice,
    liquidityDelta,
    activationType: 1, // 0 slot, 1 timestamp
    hasAlphaVault: false,
    collectFeeMode: poolConfig.feeCollectionMode,
    activationPoint: null,
    tokenAProgram: TOKEN_PROGRAM_ID,
    tokenBProgram: TOKEN_PROGRAM_ID,
  };

  const {
    tx: transaction,
    pool: poolAddress,
    position,
  } = await cpAmm.createCustomPoolWithDynamicConfig(createPoolParams);
  transaction.feePayer = wallet.publicKey;

  transaction.recentBlockhash = (
    await connection.getLatestBlockhash()
  ).blockhash;

  if (poolConfig.dryRun) {
    console.log(await connection.simulateTransaction(transaction));
  } else {
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [wallet, positionNft],
      {
        commitment: "confirmed",
      }
    );
    console.log(`>> creating pool: ${poolConfig.pair}`, {
      signature,
      poolAddress: poolAddress.toString(),
      position: position.toString(),
    });
    // result.push({
    //   pair: poolConfig.pair,
    //   signature,
    //   poolAddress: poolAddress.toString(),
    //   position: position.toString(),
    //   tokenADepositToPool: tokenADepositToPool.toString(),
    //   tokenBDepositToPool: tokenBDepositToPool.toString(),
    //   maxAmountTokenA: maxAmountTokenA.toString(),
    //   maxAmountTokenB: maxAmountTokenB.toString(),
    // });
    // fs.writeFileSync(
    //   `./scripts/concentrated_pool/logs/${poolConfig.pair}_${Date.now()}.json`,
    //   JSON.stringify(result, null, 4)
    // );
  }
})();
