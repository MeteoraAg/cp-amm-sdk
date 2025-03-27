import {
  clusterApiUrl,
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  BaseFee,
  CpAmm,
  InitializeCustomizeablePoolParams,
  PoolFeesParams,
} from "../src";
(async () => {
  const wallet = Keypair.fromSecretKey(
    Uint8Array.from(
      Uint8Array.from(require("/Users/minhdo/.config/solana/id.json"))
    )
  );

  const tokenY = new PublicKey("EtH7yJDPqhPak8og84MTpKwoMEssgKQC7K77DArA9UUi");
  const tokenX = new PublicKey("4eQ3PiW2n3bhKEopYDBe2pVxd66MjwowXzbFWYq95pZv");
  const connection = new Connection(clusterApiUrl("devnet"));
  const cpAmm = new CpAmm(connection);

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

  const slot = await connection.getSlot();
  const blockInfo = await connection.getBlock(slot, {
    maxSupportedTransactionVersion: 0,
  });

  const params: InitializeCustomizeablePoolParams = {
    payer: wallet.publicKey,
    creator: wallet.publicKey,
    positionNft: positionNft.publicKey,
    tokenX,
    tokenY,
    tokenXAmount: new BN(1000 * 10 ** 6),
    tokenYAmount: new BN(1000 * 10 ** 6),
    tokenXDecimal: 6,
    tokenYDecimal: 6,
    poolFees,
    hasAlphaVault: false,
    activationType: 1, // 0 slot, 1 timestamp
    collectFeeMode: 0,
    activationPoint: null,
  };

  const { tx: transaction } = await cpAmm.createCustomPool(params);
  const signature = await sendAndConfirmTransaction(connection, transaction, [
    wallet,
    positionNft,
  ]);
  console.log(signature);
})();
