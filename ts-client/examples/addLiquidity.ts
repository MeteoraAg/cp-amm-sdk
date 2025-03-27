import {
  clusterApiUrl,
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { CpAmm, getTokenProgram, CP_AMM_PROGRAM_ID } from "../src";
(async () => {
  const wallet = Keypair.fromSecretKey(
    Uint8Array.from(require("/Users/minhdo/.config/solana/id.json"))
  );
  const pool = new PublicKey("8soa1QkfAXNVhB65t9tcDiHNGfw9yQo6QBXYmxGBCUnn");
  const position = new PublicKey(
    "AV97BVWZm52jCMq16GoUTSqy1Hw4nYmb3nrPkRynhMa2"
  );
  const connection = new Connection(clusterApiUrl("devnet"));
  const cpAmm = new CpAmm(connection);
  const positionState = await cpAmm.fetchPositionState(position);
  const poolState = await cpAmm.fetchPoolState(pool);
  const {
    sqrtPrice,
    sqrtMaxPrice,
    sqrtMinPrice,
    tokenAMint,
    tokenBMint,
    tokenAVault,
    tokenBVault,
    tokenAFlag,
    tokenBFlag,
  } = poolState;

  const liquidityDelta = await cpAmm.getLiquidityDelta({
    maxAmountTokenA: new BN(100_000 * 10 ** 6),
    maxAmountTokenB: new BN(100_000 * 10 ** 6),
    tokenAMint,
    tokenBMint,
    sqrtMaxPrice,
    sqrtMinPrice,
    sqrtPrice,
  });

  const transaction = await cpAmm.addLiquidity({
    owner: wallet.publicKey,
    position,
    positionNftMint: positionState.nftMint,
    liquidityDeltaQ64: liquidityDelta,
    tokenAAmountThreshold: new BN(100000000735553),
    tokenBAmountThreshold: new BN(100000000735553),
    tokenAMint,
    tokenBMint,
    tokenAProgram: getTokenProgram(tokenAFlag),
    tokenBProgram: getTokenProgram(tokenBFlag),
  });
  const signature = await sendAndConfirmTransaction(connection, transaction, [
    wallet,
  ]);
  console.log(signature);
})();
