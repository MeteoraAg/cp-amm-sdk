import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmRawTransaction,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  BASIS_POINT_MAX,
  CpAmm,
  deriveConfigAddress,
  FEE_DENOMINATOR,
  getSqrtPriceFromPrice,
} from "../src";
import privateConfig from "./config/privateConfig.json";
import Decimal from "decimal.js";

(async () => {
  const wallet = Keypair.fromSecretKey(
    Uint8Array.from(require(privateConfig.keypairFilePath))
  );

  const connection = new Connection(privateConfig.rpcUrl);
  const cpAmm = new CpAmm(connection);

  const program = cpAmm._program;

  const configAccount = deriveConfigAddress(new BN(privateConfig.configIndex));

  const configState = await cpAmm._program.account.config.fetchNullable(
    configAccount
  );
  const preInstruction = [];
  if (configState) {
    const instruction = await cpAmm._program.methods
      .closeConfig()
      .accountsPartial({
        config: configAccount,
        rentReceiver: wallet.publicKey,
        admin: wallet.publicKey,
      })
      .instruction();
    preInstruction.push(instruction);
  }

  const sqrtMinPrice = getSqrtPriceFromPrice(
    privateConfig.minPrice.toString(),
    privateConfig.baseTokenDecimal,
    privateConfig.quoteTokenDecimal
  );
  const sqrtMaxPrice = getSqrtPriceFromPrice(
    privateConfig.maxPrice.toString(),
    privateConfig.baseTokenDecimal,
    privateConfig.quoteTokenDecimal
  );

  const cliffFeeNumerator = new BN(
    privateConfig.baseFeeBps * FEE_DENOMINATOR
  ).divn(BASIS_POINT_MAX);

  let dynamicFee = null;
  if (privateConfig.dynamicFee) {
    const priceRatio = privateConfig.maxPriceChangeBps / BASIS_POINT_MAX + 1;
    // Q64
    const sqrtPriceRatioQ64 = new BN(
      Decimal.sqrt(priceRatio.toString())
        .mul(Decimal.pow(2, 64))
        .floor()
        .toFixed()
    );
    const ONE = new BN(1).shln(64);
    const deltaBinId = sqrtPriceRatioQ64
      .sub(ONE)
      .div(new BN(1844674407370955))
      .muln(2);

    const maxVolatilityAccumulator = new BN(deltaBinId.muln(BASIS_POINT_MAX));

    const squareVfaBin = maxVolatilityAccumulator.mul(new BN(1)).pow(new BN(2));

    const baseFeeNumerator = new BN(
      privateConfig.baseFeeBps * FEE_DENOMINATOR
    ).divn(BASIS_POINT_MAX);

    const maxDynamicFeeNumerator = baseFeeNumerator.muln(20).divn(100); // default max dynamic fee = 20% of base fee.
    const vFee = maxDynamicFeeNumerator
      .mul(new BN(100_000_000_000))
      .sub(new BN(99_999_999_999));

    const variableFeeControl = vFee.div(squareVfaBin);

    dynamicFee = {
      binStep: 1,
      binStepU128: new BN("1844674407370955"),
      filterPeriod: 10,
      decayPeriod: 120,
      reductionFactor: 5000,
      maxVolatilityAccumulator: maxVolatilityAccumulator.toNumber(),
      variableFeeControl: variableFeeControl.toNumber(),
    };
  }
  const createConfigParams = {
    index: new BN(privateConfig.configIndex),
    poolFees: {
      baseFee: {
        cliffFeeNumerator: cliffFeeNumerator,
        numberOfPeriod: 0,
        reductionFactor: new BN(0),
        periodFrequency: new BN(0),
        feeSchedulerMode: 0,
      },
      protocolFeePercent: 20, // 20% of lp fee
      partnerFeePercent: 0,
      referralFeePercent: 20, // 20 % of protocol fee
      dynamicFee,
    },
    sqrtMinPrice,
    sqrtMaxPrice,
    vaultConfigKey: PublicKey.default, // default pubkey
    poolCreatorAuthority: new PublicKey(privateConfig.poolCreatorAuthority),
    activationType: 1, // default timestamp
    collectFeeMode: privateConfig.collectFeeMode,
  };

  const transaction = await program.methods
    .createConfig(createConfigParams)
    .accountsPartial({
      config: configAccount,
      admin: wallet.publicKey,
    })
    .preInstructions(preInstruction)
    .transaction();

  transaction.recentBlockhash = (
    await connection.getLatestBlockhash()
  ).blockhash;
  transaction.sign(wallet);

  // const signature = await sendAndConfirmRawTransaction(
  //   connection,
  //   transaction.serialize()
  // );

  // console.log({
  //   config: configAccount.toString(),
  //   signature,
  // });
})();
