import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { CpAmm, derivePoolAuthority, deriveRewardVaultAddress } from "../src";
import rewardConfig from "./config/rewardConfig.json";
import {
  getAssociatedTokenAddress,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";

(async () => {
  const wallet = Keypair.fromSecretKey(
    Uint8Array.from(require(rewardConfig.keypairFilePath))
  );

  const connection = new Connection(rewardConfig.rpcUrl);
  const cpAmm = new CpAmm(connection);

  const program = cpAmm._program;

  const tokenProgram = (
    await connection.getAccountInfo(new PublicKey(rewardConfig.rewardMint))
  ).owner;

  const rewardVault = deriveRewardVaultAddress(
    new PublicKey(rewardConfig.poolAddress),
    rewardConfig.rewardIndex
  );

  const funderTokenAccount = getAssociatedTokenAddressSync(
    new PublicKey(rewardConfig.rewardMint),
    wallet.publicKey,
    true,
    tokenProgram
  );

  const transaction = await program.methods
    .fundReward(rewardConfig.rewardIndex, new BN(1_000_000_000), false)
    .accountsPartial({
      pool: new PublicKey(rewardConfig.poolAddress),
      rewardVault,
      rewardMint: new PublicKey(rewardConfig.rewardMint),
      funderTokenAccount,
      funder: wallet.publicKey,
      tokenProgram,
    })
    .transaction();

  transaction.feePayer = wallet.publicKey;

  transaction.recentBlockhash = (
    await connection.getLatestBlockhash()
  ).blockhash;

  console.log(await connection.simulateTransaction(transaction));

  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [wallet],
    {
      commitment: "confirmed",
      maxRetries: 3,
    }
  );

  console.log(`tx: ${signature}`);
})();
