import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { CpAmm, CreatePoolParams, getSqrtPriceFromPrice } from "../src";
import {
  getMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import poolConfig from "./config/poolConfig.json";

(async () => {
  const wallet = Keypair.fromSecretKey(
    Uint8Array.from(require(poolConfig.keypairFilePath))
  );

  const connection = new Connection(poolConfig.rpcUrl);
  const cpAmm = new CpAmm(connection);
  const multiplierA = new BN(10 ** poolConfig.tokenADecimal);

  const multiplierB = new BN(10 ** poolConfig.tokenBDecimal);
  const maxTokenAAmount = new BN(poolConfig.maxTokenAAmount).mul(multiplierA);
  const maxTokenBAmount = new BN(poolConfig.maxTokenBAmount).mul(multiplierB);

  const configState = await cpAmm.fetchConfigState(
    new PublicKey(poolConfig.configAccount)
  );

  let tokenAInfo = null;
  let tokenAProgram = TOKEN_PROGRAM_ID;

  const tokenAMintAccountInfo = await connection.getAccountInfo(
    new PublicKey(poolConfig.tokenAMint)
  );
  if (tokenAMintAccountInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    const epochInfo = await connection.getEpochInfo();
    const tokenAMint = await getMint(
      connection,
      new PublicKey(poolConfig.tokenAMint),
      connection.commitment,
      tokenAMintAccountInfo.owner
    );
    tokenAInfo = {
      mint: tokenAMint,
      currentEpoch: epochInfo.epoch,
    };
    tokenAProgram = TOKEN_2022_PROGRAM_ID;
  }

  const initSqrtPrice = getSqrtPriceFromPrice(
    poolConfig.initPrice.toString(),
    poolConfig.tokenADecimal,
    poolConfig.tokenBDecimal
  );

  const liquidityDelta = cpAmm.getLiquidityDelta({
    maxAmountTokenA: maxTokenAAmount,
    maxAmountTokenB: maxTokenBAmount,
    sqrtPrice: initSqrtPrice,
    sqrtMinPrice: configState.sqrtMinPrice,
    sqrtMaxPrice: configState.sqrtMaxPrice,
    tokenAInfo,
  });

  const positionNft = Keypair.generate();
  const createPoolParams: CreatePoolParams = {
    creator: wallet.publicKey,
    payer: wallet.publicKey,
    config: new PublicKey(poolConfig.configAccount),
    positionNft: positionNft.publicKey,
    tokenAMint: new PublicKey(poolConfig.tokenAMint),
    tokenBMint: new PublicKey(poolConfig.tokenBMint),
    tokenAAmount: maxTokenAAmount,
    tokenBAmount: maxTokenBAmount,
    initSqrtPrice: initSqrtPrice,
    liquidityDelta,
    activationPoint: poolConfig.activationPoint,
    tokenAProgram,
    tokenBProgram: TOKEN_PROGRAM_ID,
  };

  const transaction = await cpAmm.createPool(createPoolParams);

  transaction.recentBlockhash = (
    await connection.getLatestBlockhash()
  ).blockhash;
  transaction.sign(wallet);
  console.log(await connection.simulateTransaction(transaction));

  const signature = await sendAndConfirmTransaction(connection, transaction, [
    wallet,
    positionNft,
  ]);
  console.log({ signature, positionNft: positionNft.publicKey });
})();
