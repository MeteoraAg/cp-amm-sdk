import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  CpAmm,
  deriveConfigAddress,
  feeNumeratorToBps,
  getDynamicFeeParams,
  MIN_SQRT_PRICE,
} from "../src";
import fs from "fs";

import configData from "./config/config.json";
import { MAX_SQRT_PRICE } from "../tests/bankrun-utils";

(async () => {
  const wallet = Keypair.fromSecretKey(
    Uint8Array.from(require(configData.keypairFilePath))
  );

  const connection = new Connection(configData.rpcUrl);
  const cpAmm = new CpAmm(connection);

  const program = cpAmm._program;
  // create
  const result = [];
  const errorIndex = [];

  for (const feeConfig of configData.feeConfig) {
    try {
      const {
        cliffFeeNumerator,
        numberOfPeriod,
        reductionFactor,
        periodFrequency,
        feeSchedulerMode,
      } = feeConfig.baseFee;

      if (feeConfig.dynamicFee) {
        const baseFeeBps = feeNumeratorToBps(new BN(cliffFeeNumerator));
        const dynamicFee = getDynamicFeeParams(baseFeeBps);
        const createConfigParams = {
          index: new BN(feeConfig.index),
          poolFees: {
            baseFee: {
              cliffFeeNumerator: new BN(cliffFeeNumerator),
              numberOfPeriod,
              reductionFactor: new BN(reductionFactor),
              periodFrequency: new BN(periodFrequency),
              feeSchedulerMode,
            },
            protocolFeePercent: 20, // 20% of lp fee
            partnerFeePercent: 0,
            referralFeePercent: 20, // 20 % of protocol fee
            dynamicFee,
          },
          sqrtMinPrice: new BN(MIN_SQRT_PRICE),
          sqrtMaxPrice: new BN(MAX_SQRT_PRICE),
          vaultConfigKey: PublicKey.default, // default pubkey
          poolCreatorAuthority: PublicKey.default, // default pubkey
          activationType: 1, // default timestamp
          collectFeeMode: feeConfig.collectFeeMode,
        };

        // build tx
        const configAccount = deriveConfigAddress(new BN(feeConfig.index));
        const closeConfigIx = await cpAmm._program.methods
          .closeConfig()
          .accountsPartial({
            config: configAccount,
            rentReceiver: wallet.publicKey,
            admin: wallet.publicKey,
          })
          .instruction();

        const transaction = await program.methods
          .createConfig(createConfigParams)
          .accountsPartial({
            config: configAccount,
            admin: wallet.publicKey,
          })
          .preInstructions([closeConfigIx])
          .transaction();

        transaction.recentBlockhash = (
          await connection.getLatestBlockhash()
        ).blockhash;
        transaction.sign(wallet);

        const signature = await connection.sendRawTransaction(
          transaction.serialize()
        );

        console.log({
          updatedConfig: configAccount.toString(),
          signature,
        });

        feeConfig["configAccount"] = configAccount.toString();
        feeConfig["dynamicFeeParams"] = dynamicFee;
        result.push(feeConfig);
      }
    } catch (e) {
      console.log("Error create config: ", feeConfig.index);
      errorIndex.push(feeConfig.index);
    }
  }

  // write log
  if (result.length > 0) {
    configData.feeConfig = result;
    fs.writeFileSync(
      `./scripts/configUpdated_${result.length}_${Date.now()}.json`,
      JSON.stringify(configData, null, 4)
    );
  }
  if (errorIndex.length > 0) {
    fs.writeFileSync(
      `./scripts/updateConfig_errors_${errorIndex.length}_${Date.now()}.json`,
      JSON.stringify(errorIndex, null, 4)
    );
  }
})();
