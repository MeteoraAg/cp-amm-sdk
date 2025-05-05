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
  getDynamicFeeParams,
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
    dynamicFee = getDynamicFeeParams(
      privateConfig.baseFeeBps,
      privateConfig.maxPriceChangeBps
    );
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
  console.log(await connection.simulateTransaction(transaction));

  // const signature = await sendAndConfirmRawTransaction(
  //   connection,
  //   transaction.serialize()
  // );

  // console.log({
  //   config: configAccount.toString(),
  //   signature,
  // });
})();
