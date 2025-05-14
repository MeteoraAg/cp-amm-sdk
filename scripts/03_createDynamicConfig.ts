import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { CpAmm, deriveConfigAddress } from "../src";
import dynamicConfig from "./config/dynamicConfig.json";
import { BN } from "@coral-xyz/anchor";

(async () => {
  const wallet = Keypair.fromSecretKey(
    Uint8Array.from(require(dynamicConfig.keypairFilePath))
  );

  const connection = new Connection(dynamicConfig.rpcUrl);
  const cpAmm = new CpAmm(connection);
  const program = cpAmm._program;

  const config = deriveConfigAddress(new BN(dynamicConfig.configIndex));
  const transaction = await program.methods
    .createDynamicConfig(new BN(dynamicConfig.configIndex), {
      poolCreatorAuthority: new PublicKey(dynamicConfig.poolCreatorAuthority),
    })
    .accountsPartial({
      config,
      admin: wallet.publicKey,
    })
    .transaction();
  transaction.feePayer = wallet.publicKey;

  transaction.recentBlockhash = (
    await connection.getLatestBlockhash()
  ).blockhash;

  console.log(await connection.simulateTransaction(transaction));

  //   const signature = await sendAndConfirmTransaction(
  //     connection,
  //     transaction,
  //     [wallet],
  //     {
  //       commitment: "confirmed",
  //       maxRetries: 3,
  //     }
  //   );

  //   console.log(`tx: ${signature}`);
})();
