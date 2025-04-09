import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { CpAmm, deriveConfigAddress } from "../src";

import configData from "./config/config.json";

export function randomID(min = 0, max = 10000) {
  return Math.floor(Math.random() * (max - min) + min);
}

(async () => {
  const wallet = Keypair.fromSecretKey(
    Uint8Array.from(require(configData.keypairFilePath))
  );

  const connection = new Connection(configData.rpcUrl);
  const cpAmm = new CpAmm(connection);

  const program = cpAmm._program;

  // dynamic fee
  let dynamicFee = null;
  if (configData.poolFees.dynamicFee) {
    dynamicFee = {
      binStep: configData.poolFees.dynamicFee.binStep,
      binStepU128: new BN(configData.poolFees.dynamicFee.binStepU128),
      filterPeriod: configData.poolFees.dynamicFee.filterPeriod,
      decayPeriod: configData.poolFees.dynamicFee.decayPeriod,
      reductionFactor: configData.poolFees.dynamicFee.reductionFactor,
      maxVolatilityAccumulator:
        configData.poolFees.dynamicFee.maxVolatilityAccumulator,
      variableFeeControl: configData.poolFees.dynamicFee.variableFeeControl,
    };
  }

  const createConfigParams = {
    index: new BN(randomID()),
    poolFees: {
      baseFee: {
        cliffFeeNumerator: new BN(
          configData.poolFees.baseFee.cliffFeeNumerator
        ),
        numberOfPeriod: configData.poolFees.baseFee.numberOfPeriod,
        reductionFactor: new BN(configData.poolFees.baseFee.reductionFactor),
        periodFrequency: new BN(configData.poolFees.baseFee.periodFrequency),
        feeSchedulerMode: configData.poolFees.baseFee.feeSchedulerMode,
      },
      protocolFeePercent: configData.poolFees.protocolFeePercent,
      partnerFeePercent: configData.poolFees.partnerFeePercent,
      referralFeePercent: configData.poolFees.referralFeePercent,
      dynamicFee,
    },
    sqrtMinPrice: new BN(configData.sqrtMinPrice),
    sqrtMaxPrice: new BN(configData.sqrtMaxPrice),
    vaultConfigKey: configData.vaultConfigKey
      ? new PublicKey(configData.vaultConfigKey)
      : PublicKey.default,
    poolCreatorAuthority: configData.poolCreatorAuthority
      ? new PublicKey(configData.poolCreatorAuthority)
      : PublicKey.default,
    activationType: configData.activationType,
    collectFeeMode: configData.collectFeeMode,
  };

  const configAccount = deriveConfigAddress(
    createConfigParams.index,
    cpAmm._program.programId
  );

  const transaction = await program.methods
    .createConfig(createConfigParams)
    .accountsPartial({
      config: configAccount,
      admin: wallet.publicKey,
    })
    .transaction();

  const signature = await sendAndConfirmTransaction(connection, transaction, [
    wallet,
  ]);
  console.log({ configAccount: configAccount.toString(), signature });
})();
