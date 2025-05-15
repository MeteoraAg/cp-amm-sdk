import {
  Connection,
  Keypair,
  PublicKey,
  sendAndConfirmRawTransaction,
} from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import {
  bpsToFeeNumerator,
  CpAmm,
  deriveConfigAddress,
  getDynamicFeeParams,
  getSqrtPriceFromPrice,
  MAX_SQRT_PRICE,
  MIN_SQRT_PRICE,
} from "../src";
import privateStaticConfig from "./config/privateStaticConfig.json";

(async () => {
  const wallet = Keypair.fromSecretKey(
    Uint8Array.from(require(privateStaticConfig.keypairFilePath))
  );

  const connection = new Connection(privateStaticConfig.rpcUrl);
  const cpAmm = new CpAmm(connection);

  const program = cpAmm._program;

  const configAccount = deriveConfigAddress(
    new BN(privateStaticConfig.configIndex)
  );

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

  const sqrtMinPrice = privateStaticConfig.minPrice
    ? getSqrtPriceFromPrice(
        privateStaticConfig.minPrice.toString(),
        privateStaticConfig.baseTokenDecimal,
        privateStaticConfig.quoteTokenDecimal
      )
    : MIN_SQRT_PRICE;
  const sqrtMaxPrice = privateStaticConfig.maxPrice
    ? getSqrtPriceFromPrice(
        privateStaticConfig.maxPrice.toString(),
        privateStaticConfig.baseTokenDecimal,
        privateStaticConfig.quoteTokenDecimal
      )
    : MAX_SQRT_PRICE;

  const cliffFeeNumerator = bpsToFeeNumerator(privateStaticConfig.baseFeeBps);

  let dynamicFee = null;
  if (privateStaticConfig.dynamicFee) {
    dynamicFee = getDynamicFeeParams(
      privateStaticConfig.baseFeeBps,
      privateStaticConfig.maxPriceChangeBps
    );
  }
  const createConfigParams = {
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
    poolCreatorAuthority: new PublicKey(
      privateStaticConfig.poolCreatorAuthority
    ),
    activationType: 1, // default timestamp
    collectFeeMode: privateStaticConfig.collectFeeMode,
  };

  const transaction = await program.methods
    .createConfig(new BN(privateStaticConfig.configIndex), createConfigParams)
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
  console.log(await connection.simulateTransaction(transaction));

  const signature = await sendAndConfirmRawTransaction(
    connection,
    transaction.serialize()
  );

  console.log({
    config: configAccount.toString(),
    signature,
  });
})();
