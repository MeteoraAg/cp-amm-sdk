import { IdlAccounts, IdlTypes, Program, BN } from "@coral-xyz/anchor";
import { PublicKey, Transaction } from "@solana/web3.js";
import type { CpAmm as CpAmmTypes } from "./idl/cp_amm";
import { Mint } from "@solana/spl-token";

export type AmmProgram = Program<CpAmmTypes>;

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

export type FeeMode = {
  feeOnInput: boolean;
  feesOnTokenA: boolean;
};

// Account state types
export type PoolState = IdlAccounts<CpAmmTypes>["pool"];
export type PositionState = IdlAccounts<CpAmmTypes>["position"];
export type VestingState = IdlAccounts<CpAmmTypes>["vesting"];
export type ConfigState = IdlAccounts<CpAmmTypes>["config"];
export type TokenBadgeState = IdlAccounts<CpAmmTypes>["tokenBadge"];

// Program params types
// export type LockPositionParams = IdlTypes<CpAmm>["VestingParameters"];
// export type AddLiquidityParams = IdlTypes<CpAmm>["AddLiquidityParameters"];
// export type RemoveLiquidityParams =
//   IdlTypes<CpAmm>["RemoveLiquidityParameters"];
// export type SwapParams = IdlTypes<CpAmm>["SwapParameters"];
// export type InitPoolParams = IdlTypes<CpAmm>["InitializePoolParameters"];
// export type InitCustomizePoolParams =
//   IdlTypes<CpAmm>["InitializeCustomizablePoolParameters"];
export type RewardInfo = IdlTypes<CpAmmTypes>["rewardInfo"];

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
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  tokenAAmount: BN;
  tokenBAmount: BN;
  sqrtMinPrice: BN;
  sqrtMaxPrice: BN;
  liquidityDelta: BN;
  initSqrtPrice: BN;
  poolFees: PoolFeesParams;
  hasAlphaVault: boolean;
  activationType: number;
  collectFeeMode: number;
  activationPoint: BN | null;
  tokenAProgram: PublicKey;
  tokenBProgram: PublicKey;
};

export type PreparePoolCreationParams = {
  tokenAAmount: BN;
  tokenBAmount: BN;

  minSqrtPrice: BN;
  maxSqrtPrice: BN;
  tokenADecimal: number;
  tokenBDecimal: number;
  tokenAInfo?: {
    mint: Mint;
    currentEpoch: number;
  };
  tokenBInfo?: {
    mint: Mint;
    currentEpoch: number;
  };
};

export type PreparedPoolCreation = {
  initSqrtPrice: BN;
  liquidityDelta: BN;
};

export type CreatePoolParams = {
  creator: PublicKey;
  payer: PublicKey;
  config: PublicKey;
  positionNft: PublicKey;
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  initSqrtPrice: BN;
  liquidityDelta: BN;
  tokenAAmount: BN;
  tokenBAmount: BN;
  activationPoint: BN | null;
  tokenAProgram: PublicKey;
  tokenBProgram: PublicKey;
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
  positionNftAccount: PublicKey;
  liquidityDeltaQ64: BN;
  maxAmountTokenA: BN;
  maxAmountTokenB: BN;
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
  sqrtPrice: BN;
  sqrtMinPrice: BN;
  sqrtMaxPrice: BN;
  tokenAInfo?: {
    mint: Mint;
    currentEpoch: number;
  };
  tokenBInfo?: {
    mint: Mint;
    currentEpoch: number;
  };
};

export type RemoveLiquidityParams = {
  owner: PublicKey;
  position: PublicKey;
  pool: PublicKey;
  positionNftAccount: PublicKey;
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

export type RemoveAllLiquidityParams = Omit<
  RemoveLiquidityParams,
  "liquidityDeltaQ64"
>;

export type BuildAddLiquidityParams = {
  owner: PublicKey;
  position: PublicKey;
  pool: PublicKey;
  positionNftAccount: PublicKey;
  liquidityDelta: BN;
  tokenAAccount: PublicKey;
  tokenBAccount: PublicKey;
  tokenAAmountThreshold: BN;
  tokenBAmountThreshold: BN;
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  tokenAVault: PublicKey;
  tokenBVault: PublicKey;
  tokenAProgram: PublicKey;
  tokenBProgram: PublicKey;
};

export type BuildRemoveAllLiquidityInstructionParams = {
  poolAuthority: PublicKey;
  owner: PublicKey;
  position: PublicKey;
  pool: PublicKey;
  positionNftAccount: PublicKey;
  tokenAAccount: PublicKey;
  tokenBAccount: PublicKey;
  tokenAAmountThreshold: BN;
  tokenBAmountThreshold: BN;
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  tokenAVault: PublicKey;
  tokenBVault: PublicKey;
  tokenAProgram: PublicKey;
  tokenBProgram: PublicKey;
};

export type ClosePositionParams = {
  owner: PublicKey;
  pool: PublicKey;
  position: PublicKey;
  positionNftMint: PublicKey;
  positionNftAccount: PublicKey;
};

export type RemoveAllLiquidityAndClosePositionParams = {
  owner: PublicKey;
  position: PublicKey;
  positionNftAccount: PublicKey;
  poolState: PoolState;
  positionState: PositionState;
  tokenAAmountThreshold: BN;
  tokenBAmountThreshold: BN;
};

export type MergePositionParams = {
  owner: PublicKey;
  positionA: PublicKey;
  positionB: PublicKey;
  poolState: PoolState;
  positionBNftAccount: PublicKey;
  positionANftAccount: PublicKey;
  positionBState: PositionState;
  tokenAAmountThreshold: BN;
  tokenBAmountThreshold: BN;
};

export type GetQuoteParams = {
  inAmount: BN;
  inputTokenMint: PublicKey;
  slippage: number;
  poolState: PoolState;
  currentTime: number;
  currentSlot: number;
  inputTokenInfo?: {
    mint: Mint;
    currentEpoch: number;
  };
  outputTokenInfo?: {
    mint: Mint;
    currentEpoch: number;
  };
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
  positionNftAccount: PublicKey;
  pool: PublicKey;
  cliffPoint: BN | null;
  periodFrequency: BN;
  cliffUnlockLiquidity: BN;
  liquidityPerPeriod: BN;
  numberOfPeriod: number;
};

export type ClaimPositionFeeInstructionParams = {
  owner: PublicKey;
  poolAuthority: PublicKey;
  pool: PublicKey;
  position: PublicKey;
  positionNftAccount: PublicKey;
  tokenAAccount: PublicKey;
  tokenBAccount: PublicKey;
  tokenAVault: PublicKey;
  tokenBVault: PublicKey;
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  tokenAProgram: PublicKey;
  tokenBProgram: PublicKey;
};

export type ClaimPositionFeeParams = {
  owner: PublicKey;
  position: PublicKey;
  pool: PublicKey;
  positionNftAccount: PublicKey;
  tokenAMint: PublicKey;
  tokenBMint: PublicKey;
  tokenAVault: PublicKey;
  tokenBVault: PublicKey;
  tokenAProgram: PublicKey;
  tokenBProgram: PublicKey;
};

export type ClosePositionInstructionParams = {
  owner: PublicKey;
  poolAuthority: PublicKey;
  pool: PublicKey;
  position: PublicKey;
  positionNftMint: PublicKey;
  positionNftAccount: PublicKey;
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
  poolState: PoolState;
  positionState: PositionState;
  positionNftAccount: PublicKey;
  rewardIndex: number;
};

export type RefreshVestingParams = {
  owner: PublicKey;
  position: PublicKey;
  positionNftAccount: PublicKey;
  pool: PublicKey;
  vestings: PublicKey[];
};

export type PermanentLockParams = {
  owner: PublicKey;
  position: PublicKey;
  positionNftAccount: PublicKey;
  pool: PublicKey;
  unlockedLiquidity: BN;
};

export type GetDepositQuoteParams = {
  inAmount: BN;
  isTokenA: boolean;
  minSqrtPrice: BN;
  maxSqrtPrice: BN;
  sqrtPrice: BN;
  inputTokenInfo?: {
    mint: Mint;
    currentEpoch: number;
  };
  outputTokenInfo?: {
    mint: Mint;
    currentEpoch: number;
  };
};

export type GetWithdrawQuoteParams = {
  liquidityDelta: BN;
  minSqrtPrice: BN;
  maxSqrtPrice: BN;
  sqrtPrice: BN;
  tokenATokenInfo?: {
    mint: Mint;
    currentEpoch: number;
  };
  tokenBTokenInfo?: {
    mint: Mint;
    currentEpoch: number;
  };
};

export type DepositQuote = {
  actualInputAmount: BN;
  consumedInputAmount: BN;
  outputAmount: BN;
  liquidityDelta: BN;
};

export type WithdrawQuote = {
  liquidityDelta: BN;
  outAmountA: BN;
  outAmountB: BN;
};
