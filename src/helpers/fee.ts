import { BN } from "@coral-xyz/anchor";
import { CollectFeeMode, FeeMode, FeeSchedulerMode, Rounding } from "../types";
import {
  BASIS_POINT_MAX,
  FEE_DENOMINATOR,
  MAX_FEE_NUMERATOR,
  SCALE_OFFSET,
} from "../constants";
import { ONE, pow } from "../math/feeMath";
import { mulDiv } from "../math";
import {
  getAmountAFromLiquidityDelta,
  getAmountBFromLiquidityDelta,
  getNextSqrtPrice,
} from "./curve";

// Fee scheduler
// Linear: cliffFeeNumerator - period * reductionFactor
// Exponential: cliffFeeNumerator * (1 -reductionFactor/BASIS_POINT_MAX)^period
export function getBaseFeeNumerator(
  feeSchedulerMode: FeeSchedulerMode,
  cliffFeeNumerator: BN,
  period: BN,
  reductionFactor: BN
): BN {
  let feeNumerator: BN;
  if (feeSchedulerMode == FeeSchedulerMode.Linear) {
    feeNumerator = cliffFeeNumerator.sub(period.mul(reductionFactor));
  } else {
    const bps = reductionFactor.shln(SCALE_OFFSET).div(new BN(BASIS_POINT_MAX));
    const base = ONE.sub(bps);
    const result = pow(base, period);
    feeNumerator = cliffFeeNumerator.mul(result).shrn(SCALE_OFFSET);
  }

  return feeNumerator;
}

/**
 * Calculates the dynamic fee numerator based on market volatility metrics
 *
 * @param volatilityAccumulator - A measure of accumulated market volatility (BN)
 * @param binStep - The size of price bins in the liquidity distribution (BN)
 * @param variableFeeControl - Parameter controlling the impact of volatility on fees (BN)
 * @returns The calculated dynamic fee numerator (BN)
 */
export function getDynamicFeeNumerator(
  volatilityAccumulator: BN,
  binStep: BN,
  variableFeeControl: BN
): BN {
  if (variableFeeControl.isZero()) {
    return new BN(0);
  }
  const squareVfaBin = volatilityAccumulator
    .mul(new BN(binStep))
    .pow(new BN(2));
  const vFee = variableFeeControl.mul(squareVfaBin);

  return vFee.add(new BN(99_999_999_999)).div(new BN(100_000_000_000));
}

/**
 * Calculates the fee numerator based on current market conditions and fee schedule configuration
 *
 * @param currentPoint - The current price point in the liquidity curve
 * @param activationPoint - The price point at which the fee schedule is activated (BN)
 * @param numberOfPeriod - The total number of periods in the fee schedule
 * @param periodFrequency - The frequency at which periods change (BN)
 * @param feeSchedulerMode - The mode determining how fees are calculated (0 = constant, 1 = linear, etc.)
 * @param cliffFeeNumerator - The initial fee numerator at the cliff point (BN)
 * @param reductionFactor - The factor by which fees are reduced in each period (BN)
 * @param dynamicFeeParams - Optional parameters for dynamic fee calculation
 * @param dynamicFeeParams.volatilityAccumulator - Measure of accumulated market volatility (BN)
 * @param dynamicFeeParams.binStep - Size of price bins in the liquidity distribution (BN)
 * @param dynamicFeeParams.variableFeeControl - Parameter controlling the impact of volatility (BN)
 * @returns The calculated fee numerator (BN), capped at MAX_FEE_NUMERATOR
 */
export function getFeeNumerator(
  currentPoint: number,
  activationPoint: BN,
  numberOfPeriod: number,
  periodFrequency: BN,
  feeSchedulerMode: number,
  cliffFeeNumerator: BN,
  reductionFactor: BN,
  dynamicFeeParams?: {
    volatilityAccumulator: BN;
    binStep: number;
    variableFeeControl: number;
  }
): BN {
  if (Number(periodFrequency) == 0) {
    return cliffFeeNumerator;
  }
  const period = new BN(currentPoint).lt(activationPoint)
    ? new BN(numberOfPeriod)
    : BN.min(
        new BN(numberOfPeriod),
        new BN(currentPoint).sub(activationPoint).div(periodFrequency)
      );

  let feeNumerator = getBaseFeeNumerator(
    feeSchedulerMode,
    cliffFeeNumerator,
    period,
    reductionFactor
  );

  if (dynamicFeeParams) {
    const { volatilityAccumulator, binStep, variableFeeControl } =
      dynamicFeeParams;
    const dynamicFeeNumberator = getDynamicFeeNumerator(
      volatilityAccumulator,
      new BN(binStep),
      new BN(variableFeeControl)
    );
    feeNumerator = feeNumerator.add(dynamicFeeNumberator);
  }
  return feeNumerator.gt(new BN(MAX_FEE_NUMERATOR))
    ? new BN(MAX_FEE_NUMERATOR)
    : feeNumerator;
}

/**
 * Determines the fee mode based on the swap direction and fee collection configuration
 *
 * @param collectFeeMode - The fee collection mode (e.g., OnlyB, BothToken)
 * @param btoA - Boolean indicating if the swap is from token B to token A
 * @returns { feeOnInput, feesOnTokenA }
 */
function getFeeMode(collectFeeMode: CollectFeeMode, btoA: boolean): FeeMode {
  const feeOnInput = btoA && collectFeeMode === CollectFeeMode.OnlyB;
  const feesOnTokenA = btoA && collectFeeMode === CollectFeeMode.BothToken;

  return {
    feeOnInput,
    feesOnTokenA,
  };
}

/**
 * Calculates the total fee amount based on the transaction amount and fee numerator
 *
 * @param amount - The transaction amount (BN)
 * @param tradeFeeNumerator - The fee numerator to apply (BN)
 * @returns The calculated fee amount (BN), rounded up
 */
function getTotalFeeOnAmount(amount: BN, tradeFeeNumerator: BN) {
  return mulDiv(
    amount,
    tradeFeeNumerator,
    new BN(FEE_DENOMINATOR),
    Rounding.Up
  );
}

/**
 *
 * Calculates the output amount and fees for a swap operation in a concentrated liquidity pool.
 *
 * @param inAmount - The input amount of tokens the user is swapping
 * @param sqrtPrice - The current square root price of the pool
 * @param liquidity - The current liquidity available in the pool
 * @param tradeFeeNumerator - The fee numerator used to calculate trading fees
 * @param aToB - Direction of the swap: true for token A to token B, false for token B to token A
 * @param collectFeeMode - Determines how fees are collected (0: both tokens, 1: only token B)
 * @returns Object containing the actual output amount after fees and the total fee amount
 */
export function getSwapAmount(
  inAmount: BN,
  sqrtPrice: BN,
  liquidity: BN,
  tradeFeeNumerator: BN,
  aToB: boolean,
  collectFeeMode: number
): { amountOut: BN; totalFee: BN } {
  let feeMode = getFeeMode(collectFeeMode, !aToB);
  let actualInAmount = inAmount;
  let totalFee = new BN(0);

  if (feeMode.feeOnInput) {
    totalFee = getTotalFeeOnAmount(inAmount, tradeFeeNumerator);
    actualInAmount = inAmount.sub(totalFee);
  }

  // Calculate the output amount based on swap direction
  const outAmount = aToB
    ? getAmountBFromLiquidityDelta(
        liquidity,
        sqrtPrice,
        getNextSqrtPrice(actualInAmount, sqrtPrice, liquidity, true),
        Rounding.Down
      )
    : getAmountAFromLiquidityDelta(
        liquidity,
        sqrtPrice,
        getNextSqrtPrice(actualInAmount, sqrtPrice, liquidity, false),
        Rounding.Down
      );

  // Apply fees to output amount if fee is taken on output
  const amountOut = feeMode.feeOnInput
    ? outAmount
    : ((totalFee = getTotalFeeOnAmount(outAmount, tradeFeeNumerator)),
      outAmount.sub(totalFee));

  return { amountOut, totalFee };
}
