import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { CpAmm, deriveConfigAddress, MIN_SQRT_PRICE } from "../src";
import fs from "fs";

import configData from "./config/config.json";
import assert from "assert";
import { MAX_SQRT_PRICE } from "../tests/bankrun-utils";

function validateFeeScheduler(
  feeSchedulerMode: number,
  expectBaseFeeValue: number,
  cliffFeeNumerator: number,
  numberOfPeriod: number,
  reductionFactor: number
) {
  let baseFee: number;
  if (feeSchedulerMode === 0) {
    // Linear mode
    baseFee = cliffFeeNumerator - numberOfPeriod * reductionFactor;
  } else if (feeSchedulerMode === 1) {
    // Exponential mode
    const decayRate = 1 - reductionFactor / 10000;
    baseFee = cliffFeeNumerator * Math.pow(decayRate, numberOfPeriod);
  }

  const absoluteDifference = Math.abs(baseFee - expectBaseFeeValue);
  const percentDifference = (absoluteDifference / expectBaseFeeValue) * 100;

  // less than 1%
  assert(percentDifference < 1);
}

function validateConfig() {
  // validate fee sheduler
  for (const feeConfig of configData.feeConfig) {
    validateFeeScheduler(
      feeConfig.baseFee.feeSchedulerMode,
      feeConfig.baseFeeValue,
      feeConfig.baseFee.cliffFeeNumerator,
      feeConfig.baseFee.numberOfPeriod,
      feeConfig.baseFee.reductionFactor
    );
  }

  // validate number of config
  const {
    totalDynamicConfig,
    totalLinearConfig,
    totalExpoConfig,
    totalQuoteOnlyConfig,
    totalBothTokenConfig,
    withoutFeeSheduler,
  } = configData.feeConfig.reduce(
    (acc, feeConfig) => {
      // check dynamic fee
      if (feeConfig.dynamicFee) {
        acc.totalDynamicConfig += 1;
      }

      //  collectFeeMode
      if (feeConfig.collectFeeMode === 0) {
        acc.totalQuoteOnlyConfig += 1;
      } else {
        acc.totalBothTokenConfig += 1;
      }

      // fee scheduler
      const { feeSchedulerMode, periodFrequency } = feeConfig.baseFee;
      if (feeSchedulerMode === 0 && periodFrequency > 0) {
        // Linear: 24 hours
        assert(
          feeConfig.baseFee.numberOfPeriod *
            feeConfig.baseFee.periodFrequency ==
            ONE_DAY
        );
        acc.totalLinearConfig += 1;
      } else if (feeSchedulerMode === 1 && periodFrequency > 0) {
        // Exponential: 2 hours
        assert(
          feeConfig.baseFee.numberOfPeriod *
            feeConfig.baseFee.periodFrequency ==
            TWO_HOURS
        );
        acc.totalExpoConfig += 1;
      } else {
        acc.withoutFeeSheduler += 1;
      }

      return acc;
    },
    {
      totalDynamicConfig: 0,
      totalLinearConfig: 0,
      totalExpoConfig: 0,
      totalQuoteOnlyConfig: 0,
      totalBothTokenConfig: 0,
      withoutFeeSheduler: 0,
    }
  );

  assert(totalDynamicConfig == TOTAL_DYNAMIC_FEE_CONFIG);
  assert(totalBothTokenConfig == TOTAL_BOTH_TOKEN_CONFIG);
  assert(totalExpoConfig == TOTAL_EXPONENTIAL_CONFIG);
  assert(withoutFeeSheduler == WITHOUT_FEE_SCHEDULER);
  assert(totalLinearConfig == TOTAL_LINEAR_CONFIG);
  assert(totalQuoteOnlyConfig == TOTAL_QUOTE_ONLY_CONFIG);

  console.log("Success validate config");
}

export const TOTAL_LINEAR_CONFIG = 24;
export const TOTAL_EXPONENTIAL_CONFIG = 24;
export const WITHOUT_FEE_SCHEDULER = 24;
export const TOTAL_DYNAMIC_FEE_CONFIG = 36;
export const TOTAL_QUOTE_ONLY_CONFIG = 36;
export const TOTAL_BOTH_TOKEN_CONFIG = 36;
export const TWO_HOURS = 2 * 60 * 60;
export const ONE_DAY = 60 * 60 * 24;

(async () => {
  const wallet = Keypair.fromSecretKey(
    Uint8Array.from(require(configData.keypairFilePath))
  );

  const connection = new Connection(configData.rpcUrl);
  const cpAmm = new CpAmm(connection);

  const program = cpAmm._program;

  validateConfig();

  const dynamicFeeConfig = {
    binStep: 1,
    binStepU128: new BN("1844674407370955"),
    filterPeriod: 10,
    decayPeriod: 120,
    reductionFactor: 5000,
    variableFeeControl: 2000000,
    maxVolatilityAccumulator: 100000,
  };
  // create
  const result = [];
  const errorIndex = [];

  for (const feeConfig of configData.feeConfig) {
    const configAccount = deriveConfigAddress(new BN(feeConfig.index));
    const configState = await program.account.config.fetchNullable(
      configAccount
    );
    // ignore if existed
    if (configState) {
      continue;
    }

    try {
      const {
        cliffFeeNumerator,
        numberOfPeriod,
        reductionFactor,
        periodFrequency,
        feeSchedulerMode,
      } = feeConfig.baseFee;

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
          dynamicFee: feeConfig.dynamicFee ? dynamicFeeConfig : null,
        },
        sqrtMinPrice: new BN(MIN_SQRT_PRICE),
        sqrtMaxPrice: new BN(MAX_SQRT_PRICE),
        vaultConfigKey: PublicKey.default, // default pubkey
        poolCreatorAuthority: PublicKey.default, // default pubkey
        activationType: 1, // default timestamp
        collectFeeMode: feeConfig.collectFeeMode,
      };

      const transaction = await program.methods
        .createConfig(createConfigParams)
        .accountsPartial({
          config: configAccount,
          admin: wallet.publicKey,
        })
        .transaction();

      transaction.recentBlockhash = (
        await connection.getLatestBlockhash()
      ).blockhash;
      transaction.sign(wallet);

      const signature = await connection.sendRawTransaction(
        transaction.serialize()
      );

      console.log({
        config: configAccount.toString(),
        signature,
      });

      feeConfig["configAccount"] = configAccount.toString();
      result.push(feeConfig);
    } catch (e) {
      console.log("Error create config: ", feeConfig.index);
      errorIndex.push(feeConfig.index);
    }
  }

  // write log
  if (result.length > 0) {
    configData.feeConfig = result;
    fs.writeFileSync(
      "./scripts/configCreated.json",
      JSON.stringify(configData)
    );
  }
  if (errorIndex.length > 0) {
    fs.writeFileSync(
      "./scripts/createConfig_errors.json",
      JSON.stringify(errorIndex)
    );
  }
})();
