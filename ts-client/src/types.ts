import { IdlAccounts, IdlTypes, Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import { CpAmm } from "./idl";

export type AmmProgram = Program<CpAmm>;

export type TxBuilder = Promise<Transaction>;

export enum Rounding {
  Up,
  Down,
}

export enum ActivationPoint {
  Timestamp,
  Slot,
}

export enum FeeSchedulerMode {
  Linear,
  Exponential,
}

export enum CollectFeeMode {
  BothToken,
  OnlyB,
}

export enum TradeDirection {
  AtoB,
  BtoA,
}

export enum ActivationType {
  Slot,
  Timestamp,
}

// Account state types
export type PoolState = IdlAccounts<CpAmm>["pool"];
export type PositionState = IdlAccounts<CpAmm>["position"];
export type VestingState = IdlAccounts<CpAmm>["vesting"];
export type ConfigState = IdlAccounts<CpAmm>["config"];
export type TokenBadgeState = IdlAccounts<CpAmm>["tokenBadge"];

// Program params types
// export type LockPositionParams = IdlTypes<CpAmm>["VestingParameters"];
// export type AddLiquidityParams = IdlTypes<CpAmm>["AddLiquidityParameters"];
// export type RemoveLiquidityParams =
//   IdlTypes<CpAmm>["RemoveLiquidityParameters"];
// export type SwapParams = IdlTypes<CpAmm>["SwapParameters"];
// export type InitPoolParams = IdlTypes<CpAmm>["InitializePoolParameters"];
// export type InitCustomizePoolParams =
//   IdlTypes<CpAmm>["InitializeCustomizablePoolParameters"];
export type RewardInfo = IdlTypes<CpAmm>["RewardInfo"];

export type DynamicFee = {
  binStep: number;
  binStepU128: BN;
  filterPeriod: number;
  decayPeriod: number;
  reductionFactor: number;
  maxVolatilityAccumulator: number;
  variableFeeControl: number;
};

export type BaseFee = {
  cliffFeeNumerator: BN;
  numberOfPeriod: number;
  periodFrequency: BN;
  reductionFactor: BN;
  feeSchedulerMode: number;
};

export type PoolFeesParams = {
  baseFee: BaseFee;
  protocolFeePercent: number;
  partnerFeePercent: number;
  referralFeePercent: number;
  dynamicFee: DynamicFee | null;
};

export type InitializeCustomizeablePoolParams = {
  payer: PublicKey;
  creator: PublicKey;
  positionNft: PublicKey;
  tokenX: PublicKey;
  tokenY: PublicKey;
  tokenXAmount: BN;
  tokenYAmount: BN;
  tokenXDecimal: number;
  tokenYDecimal: number;
  poolFees: PoolFeesParams;
  hasAlphaVault: boolean;
  activationType: number;
  collectFeeMode: number;
  activationPoint: BN | null;
  tokenXProgram?: PublicKey;
  tokenYProgram?: PublicKey;
};

export type PreparePoolCreationParams = {
  tokenX: PublicKey;
  tokenY: PublicKey;
  tokenXAmount: BN;
  tokenYAmount: BN;
  tokenXDecimal: number;
  tokenYDecimal: number;
};

export type PreparedPoolCreation = {
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  sqrtPriceQ64: BN;
  liquidityQ64: BN;
};

export type CreatePoolParams = {
  creator: PublicKey;
  payer: PublicKey;
  config: PublicKey;
  tokenX: PublicKey;
  tokenY: PublicKey;
  tokenXAmount: BN;
  tokenYAmount: BN;
  tokenXDecimal: number;
  tokenYDecimal: number;
  activationPoint: BN | null;
};

export type CreatePositionParams = {
  owner: PublicKey;
  payer: PublicKey;
  pool: PublicKey;
  positionNft: PublicKey;
};

export type AddLiquidityParams = {
  owner: PublicKey;
  position: PublicKey;
  pool: PublicKey;
  positionNftMint: PublicKey;
  liquidityDeltaQ64: BN;
  tokenAAmountThreshold: BN;
  tokenBAmountThreshold: BN;
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  tokenAVault: PublicKey;
  tokenBVault: PublicKey;
  tokenAProgram: PublicKey;
  tokenBProgram: PublicKey;
};

export type LiquidityDeltaParams = {
  maxAmountTokenA: BN;
  maxAmountTokenB: BN;
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  sqrtPrice: BN;
  sqrtMinPrice: BN;
  sqrtMaxPrice: BN;
};

export type RemoveLiquidityParams = AddLiquidityParams;

export type GetQuoteParams = {
  inAmount: BN;
  inputTokenMint: PublicKey;
  slippage: number;
  poolState: PoolState;
};

export type SwapQuotes = {
  totalFee: BN;
  minOutAmount: BN;
  actualAmount: BN;
};

export type SwapParams = {
  payer: PublicKey;
  pool: PublicKey;
  inputTokenMint: PublicKey;
  outputTokenMint: PublicKey;
  amountIn: BN;
  minimumAmountOut: BN;
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  tokenAVault: PublicKey;
  tokenBVault: PublicKey;
  tokenAProgram: PublicKey;
  tokenBProgram: PublicKey;
  referralTokenAccount: PublicKey | null;
};

export type LockPositionParams = {
  owner: PublicKey;
  payer: PublicKey;
  vestingAccount: PublicKey;
  position: PublicKey;
  positionNftMint: PublicKey;
  pool: PublicKey;
  cliffPoint: BN | null;
  periodFrequency: BN;
  cliffUnlockLiquidity: BN;
  liquidityPerPeriod: BN;
  numberOfPeriod: number;
  vestings: PublicKey[];
};

export type ClaimPositionFeeParams = {
  owner: PublicKey;
  position: PublicKey;
  pool: PublicKey;
  nftPositionMint: PublicKey;
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  tokenAVault: PublicKey;
  tokenBVault: PublicKey;
  tokenAProgram: PublicKey;
  tokenBProgram: PublicKey;
};

export type InitializeRewardParams = {
  rewardIndex: number;
  rewardDuration: BN;
  pool: PublicKey;
  rewardMint: PublicKey;
  payer: PublicKey;
};

export type UpdateRewardDurationParams = {
  pool: PublicKey;
  admin: PublicKey;
  rewardIndex: number;
  newDuration: BN;
};

export type UpdateRewardFunderParams = {
  pool: PublicKey;
  admin: PublicKey;
  rewardIndex: number;
  newFunder: PublicKey;
};

export type FundRewardParams = {
  funder: PublicKey;
  rewardIndex: number;
  pool: PublicKey;
  carryForward: boolean;
  amount: BN;
};

export type WithdrawIneligibleRewardParams = {
  rewardIndex: number;
  pool: PublicKey;
  funder: PublicKey;
};

export type ClaimPartnerFeeParams = {
  partner: PublicKey;
  pool: PublicKey;
  maxAmountA: BN;
  maxAmountB: BN;
};

export type ClaimRewardParams = {
  user: PublicKey;
  position: PublicKey;
  rewardIndex: number;
};

export type RefreshVestingParams = {
  owner: PublicKey;
  position: PublicKey;
  positionNftMint: PublicKey;
  pool: PublicKey;
  vestings: PublicKey[];
};

export type PermanentLockParams = {
  owner: PublicKey;
  position: PublicKey;
  positionNftMint: PublicKey;
  pool: PublicKey;
  unlockedLiquidity: BN;
};
