# Dynamic DAMM-V2 SDK: Function Documentation

## Table of Contents
- [Core Functions](#core-functions)
  - [createPool](#createpool)
  - [createCustomPool](#createcustompool)
  - [createCustomPoolWithDynamicConfig](#createcustompoolwithdynamicconfig)
  - [createPosition](#createposition)
  - [getLiquidityDelta](#getliquiditydelta)
  - [getQuote](#getquote)
  - [getDepositQuote](#getdepositquote)
  - [getWithdrawQuote](#getwithdrawquote)
  - [swap](#swap)
  - [addLiquidity](#addliquidity)
  - [removeLiquidity](#removeliquidity)
  - [removeAllLiquidity](#removeallliquidity)
  - [removeAllLiquidityAndClosePosition](#removeallliquidityandcloseposition)
  - [mergePosition](#mergeposition)
  - [lockPosition](#lockposition)
  - [permanentLockPosition](#permanentlockposition)
  - [refreshVesting](#refreshvesting)
  - [claimPositionFee](#claimpositionfee)
  - [claimPositionFee2](#claimpositionfee2)
  - [claimPartnerFee](#claimpartnerfee)
  - [claimReward](#claimreward)
  - [closePosition](#closeposition)
- [State Functions](#state-functions)
  - [fetchConfigState](#fetchconfigstate)
  - [fetchPoolState](#fetchpoolstate)
  - [fetchPositionState](#fetchpositionstate)
  - [getAllConfigs](#getallconfigs)
  - [getAllPools](#getallpools)
  - [getAllPositions](#getallpositions)
  - [getAllPositionsByPool](#getallpositionsbypool)
  - [getUserPositionByPool](#getuserpositionbypool)
  - [getPositionsByUser](#getpositionsbyuser)
  - [getAllVestingsByPosition](#getallvestingsbyposition)
  - [isLockedPosition](#islockedposition)
  - [isPoolExist](#ispoolexist)
- [Helper Functions](#helper-functions)
  - [preparePoolCreationParams](#preparepoolcreationparams)
  - [getProgram](#getprogram)
  - [isVestingComplete](#isvestingcomplete)
  - [getTotalLockedLiquidity](#gettotallockedliquidity)
  - [getAvailableVestingLiquidity](#getavailablevestingliquidity)
  - [getMaxAmountWithSlippage](#getmaxamountwithslippage)
  - [getMinAmountWithSlippage](#getminamountwithslippage)
  - [getPriceImpact](#getpriceimpact)
  - [getPriceFromSqrtPrice](#getpricefromsqrtprice)
  - [getSqrtPriceFromPrice](#getsqrtpricefromprice)
  - [getUnClaimReward](#getunclaimreward)
  - [getBaseFeeNumerator](#getbasefeenumerator)
  - [getDynamicFeeNumerator](#getdynamicfeenumerator)
  - [bpsToFeeNumerator](#bpstofeenumerator)
  - [feeNumeratorToBps](#feenumeratortobps)
  - [getBaseFeeParams](#getbasefeeparams)
  - [getDynamicFeeParams](#getdynamicfeeparams)

---

## Core Functions

### createPool

Creates a new standard pool according to a predefined configuration.

#### Function
```typescript
async createPool(params: CreatePoolParams): TxBuilder
```

#### Parameters
```typescript
interface CreatePoolParams {
  payer: PublicKey;              // The wallet paying for the transaction
  creator: PublicKey;            // The creator of the pool
  config: PublicKey;             // The configuration account for the pool
  positionNft: PublicKey;        // The mint for the initial position NFT
  tokenAMint: PublicKey;         // The mint address for token A
  tokenBMint: PublicKey;         // The mint address for token B
  activationPoint: BN | null;           // The slot or timestamp for activation 
  tokenAAmount: BN;              // Initial amount of token A to deposit
  tokenBAmount: BN;              // Initial amount of token B to deposit
  initSqrtPrice: BN;             // Initial sqrt price in Q64 format
  liquidityDelta: BN;            // Initial liquidity delta in Q64 format
  tokenAProgram: PublicKey;      // Token program for token A
  tokenBProgram: PublicKey;      // Token program for token B
  isLockLiquidity?: boolean;     // true if you wanna permanent lock position after pool created.
}
```

#### Returns
A transaction builder (`TxBuilder`) that can be used to build, sign, and send the transaction.

#### Example
```typescript
// First, prepare the pool creation parameters
const configState = await cpAmm.getConfigState(configAccount);
const initPrice = 10; // 1 base token = 10 quote token
const {actualInputAmount, consumedInputAmount, outputAmount, liquidityDelta} = cpAmm.getDepositQuote({
  inAmount: new BN(5_000_000_000), // 5 tokenA (base token) with 9 decimals
  isTokenA: true;
  minSqrtPrice: configState.sqrtMinPrice,
  maxSqrtPrice: configState.sqrtMinPrice,
  sqrtPrice: getSqrtPriceFromPrice(initPrice, tokenADecimal, tokenBDecimal),
  inputTokenInfo, // provide if input token is token2022
  outputTokenInfo // provide if output token is token2022
})

const createPoolTx = await cpAmm.createPool({
  payer: wallet.publicKey,
  creator: wallet.publicKey,
  config: configAddress,
  positionNft: positionNftMint,
  tokenAMint,
  tokenBMint,
  activationPoint: null,
  tokenAAmount: consumedInputAmount,
  tokenBAmount: outputAmount,
  initSqrtPrice: getSqrtPriceFromPrice(initPrice, tokenADecimal, tokenBDecimal);,
  liquidityDelta: liquidityDelta,
  tokenAProgram,
  tokenBProgram
});
```

#### Notes
- Both token amounts must be greater than zero
- If using native SOL, it will be automatically wrapped to wSOL
- The `config` parameter should be a valid configuration account
- Pool creation automatically creates an initial position
- Use `preparePoolCreationParams` to calculate proper `initSqrtPrice` and `liquidityDelta`

---

### createCustomPool

Creates a customizable pool with specific fee parameters, reward settings, and activation conditions.

#### Function
```typescript
async createCustomPool(params: InitializeCustomizeablePoolParams): Promise<{
  tx: Transaction;
  pool: PublicKey;
  position: PublicKey;
}>
```

#### Parameters
```typescript
interface InitializeCustomizeablePoolParams {
  payer: PublicKey;              // The wallet paying for the transaction
  creator: PublicKey;            // The creator of the pool
  positionNft: PublicKey;        // The mint for the initial position NFT
  tokenAMint: PublicKey;         // The mint address for token A
  tokenBMint: PublicKey;         // The mint address for token B
  tokenAAmount: BN;              // Initial amount of token A to deposit
  tokenBAmount: BN;              // Initial amount of token B to deposit
  sqrtMinPrice: BN;              // Minimum sqrt price
  sqrtMaxPrice: BN;              // Maximum sqrt price
  initSqrtPrice: BN;             // Initial sqrt price in Q64 format
  liquidityDelta: BN;            // Initial liquidity in Q64 format
  tokenAProgram: PublicKey;      // Token program for token A
  tokenBProgram: PublicKey;      // Token program for token B
  poolFees: PoolFees;            // Fee configuration
  hasAlphaVault: boolean;        // Whether the pool has an alpha vault
  collectFeeMode: number;        // How fees are collected (0: normal, 1: alpha)
  activationPoint: BN;           // The slot or timestamp for activation
  activationType: number;        // 0: slot, 1: timestamp
  isLockLiquidity?: boolean;     // true if you wanna permanent lock position after pool created.
}

interface PoolFees {
  baseFee: {
    cliffFeeNumerator: BN;   // Initial fee numerator
    numberOfPeriod: number;      // Number of fee reduction periods
    reductionFactor: BN;     // How much fee reduces each period
    periodFrequency: number;     // How often fees change
    feeSchedulerMode: number;    // 0: Linear, 1: Exponential
  };
  dynamicFee?: {                 // Optional dynamic fee configuration
    binStep: number;
    binStepU128: BN;
    filterPeriod: number;
    decayPeriod: number;
    reductionFactor: number;
    variableFeeControl: number;
    maxVolatilityAccumulator: number;
  };
}
```

#### Returns
An object containing:
- `tx`: The transaction to sign and send
- `pool`: The public key of the created pool
- `position`: The public key of the initial position

#### Example
```typescript
// First, prepare the pool creation parameters
const { initSqrtPrice, liquidityDelta } = cpAmm.preparePoolCreationParams({
  tokenAAmount: new BN(5_000_000_000),
  tokenBAmount: new BN(20_000_000),
  minSqrtPrice: MIN_SQRT_PRICE,
  maxSqrtPrice: MAX_SQRT_PRICE
});

const poolFees = {
  baseFee: {
    feeSchedulerMode: 0, // 0: Linear, 1: Exponential
    cliffFeeNumerator: 1_000_000,
    numberOfPeriod: 0,
    reductionFactor: 0,
    periodFrequency: 0
  },
  partnerFee: {
    partnerAddress: partnerWallet.publicKey,
    partnerFeeNumerator: 1000,
  },
  dynamicFee: {
    binStep: 1,
    binStepU128: new BN("1844674407370955"),
    filterPeriod: 10,
    decayPeriod: 120,
    reductionFactor: 5000,
    variableFeeControl: 2000000,
    maxVolatilityAccumulator: 100000,
  };
};

const { tx, pool, position } = await cpAmm.createCustomPool({
  payer: wallet.publicKey,
  creator: wallet.publicKey,
  positionNft: positionNftMint,
  tokenAMint: usdcMint,
  tokenBMint: btcMint,
  tokenAAmount: new BN(5_000_000_000),
  tokenBAmount: new BN(20_000_000),
  sqrtMinPrice: MIN_SQRT_PRICE,
  sqrtMaxPrice: MAX_SQRT_PRICE,
  initSqrtPrice: initSqrtPrice,
  liquidityDelta: liquidityDelta,
  poolFees,
  hasAlphaVault: false,
  collectFeeMode: 0, // 0: BothToken, 1: onlyB
  activationPoint: new BN(Date.now()),
  activationType: 1, // 0: slot, 1: timestamp
  tokenAProgram,
  tokenBProgram
});
```

#### Notes
- Use this function instead of `createPool` when you need custom fee structures
- Use `preparePoolCreationParams` to calculate proper `initSqrtPrice` and `liquidityDelta`

---

## createCustomPoolWithDynamicConfig

Creates a customizable pool with dynamic configuration, allowing for specific fee parameters with specified pool creator authority

### Function
```typescript
async createCustomPoolWithDynamicConfig(params: InitializeCustomizeablePoolWithDynamicConfigParams): Promise<{
  tx: Transaction;
  pool: PublicKey;
  position: PublicKey;
}>
```

### Parameters
```typescript
interface InitializeCustomizeablePoolWithDynamicConfigParams {
  payer: PublicKey;              // The wallet paying for the transaction
  creator: PublicKey;            // The creator of the pool
  positionNft: PublicKey;        // The mint for the initial position NFT
  tokenAMint: PublicKey;         // The mint address for token A
  tokenBMint: PublicKey;         // The mint address for token B
  tokenAAmount: BN;              // Initial amount of token A to deposit
  tokenBAmount: BN;              // Initial amount of token B to deposit
  sqrtMinPrice: BN;              // Minimum sqrt price
  sqrtMaxPrice: BN;              // Maximum sqrt price
  initSqrtPrice: BN;             // Initial sqrt price in Q64 format
  liquidityDelta: BN;            // Initial liquidity in Q64 format
  poolFees: PoolFeesParams;      // Fee configuration
  hasAlphaVault: boolean;        // Whether the pool has an alpha vault
  collectFeeMode: number;        // How fees are collected (0: normal, 1: alpha)
  activationPoint: BN | null;    // The slot or timestamp for activation (null for immediate)
  activationType: number;        // 0: slot, 1: timestamp
  tokenAProgram: PublicKey;      // Token program for token A
  tokenBProgram: PublicKey;      // Token program for token B
  config: PublicKey;             // dynamic config account
  poolCreatorAuthority: PublicKey; // Authority allowed to create pools with this config
  isLockLiquidity?: boolean;     // true if you wanna permanent lock position after pool created.
}
```

### Returns
An object containing:
- `tx`: The transaction to sign and send
- `pool`: The public key of the created pool
- `position`: The public key of the initial position

### Example
```typescript
// First, prepare the pool creation parameters
const tokenAAmount = new BN(5_000_000_000);
const tokenBAmount = new BN(20_000_000);
const sqrtPrice = getSqrtPriceFromPrice("172", tokenADecimal, tokenBDecimal);
const sqrtMinPrice = getSqrtPriceFromPrice("4", tokenADecimal, tokenBDecimal);
const sqrtMaxPrice = getSqrtPriceFromPrice("400", tokenADecimal, tokenBDecimal);
const { initSqrtPrice, liquidityDelta } = cpAmm.getLiquidityDelta({
  maxAmountTokenA: tokenAAmount,
  maxAmountTokenB: tokenBAmount,
  sqrtMaxPrice,
  sqrtMinPrice,
  sqrtPrice,
});

const baseFeeParams = getBaseFeeParams(25, 25, FeeSchedulerMode.Linear, 0, 0); // base fee: 0.25%
const dynamicFeeParams = getDynamicFeeParams(25); // max dynamic fee 0.25%
const poolFees: PoolFeesParams = {
    baseFee: baseFeeParams,
    protocolFeePercent: 20,
    partnerFeePercent: 0,
    referralFeePercent: 20,
    dynamicFee: dynamicFeeParams,
  };

const { tx, pool, position } = await cpAmm.createCustomPoolWithDynamicConfig({
  payer
  creator,
  config: dynamicConfigAddress,
  poolCreatorAuthority: poolCreatorAuth.publicKey,
  positionNft: positionNftMint,
  tokenAMint: usdcMint,
  tokenBMint: btcMint,
  tokenAAmount,
  tokenBAmount,
  sqrtMinPrice,
  sqrtMaxPrice,
  initSqrtPrice,
  liquidityDelta,
  poolFees,
  hasAlphaVault: false,
  collectFeeMode: 0, // 0: Both tokens, 1: Only token B
  activationPoint: null,
  activationType: 1, // 0: slot, 1: timestamp
  tokenAProgram: TOKEN_PROGRAM_ID,
  tokenBProgram: TOKEN_PROGRAM_ID,
});
```


### createPosition

Creates a new position in an existing pool.

#### Function
```typescript
async createPosition(params: CreatePositionParams): TxBuilder
```

#### Parameters
```typescript
interface CreatePositionParams {
  owner: PublicKey;          // The owner of the position
  payer: PublicKey;          // The wallet paying for the transaction
  pool: PublicKey;           // The pool to create a position in
  positionNft: PublicKey;    // The mint for the position NFT
}
```

#### Returns
A transaction builder (`TxBuilder`) that can be used to build, sign, and send the transaction.

#### Example
```typescript
const createPositionTx = await cpAmm.createPosition({
  owner: wallet.publicKey,
  payer: wallet.publicKey,
  pool: poolAddress,
  positionNft: positionNftMint
});

const tx = await createPositionTx.transaction();
const result = await wallet.sendTransaction(tx, connection);
```

#### Notes
- The `positionNft` should be a new mint that doesn't already have a position
- Creating a position doesn't automatically add liquidity
- After creating a position, use `addLiquidity` to provide tokens

---

### getLiquidityDelta

Calculates the liquidity delta based on the provided token amounts and price ranges.

#### Function
```typescript
async getLiquidityDelta(params: LiquidityDeltaParams): Promise<BN>
```

#### Parameters
```typescript
interface LiquidityDeltaParams {
  maxAmountTokenA: BN;          // Maximum amount of token A to use
  maxAmountTokenB: BN;          // Maximum amount of token B to use
  sqrtMaxPrice: BN;             // Maximum sqrt price for the range
  sqrtMinPrice: BN;             // Minimum sqrt price for the range
  sqrtPrice: BN;                // Current sqrt price
}
```

#### Returns
A BN representing the liquidity delta in Q64 format.

### getQuote

Calculates the expected output amount for a swap, including fees and slippage protection.

#### Function
```typescript
async getQuote(params: GetQuoteParams): Promise<{
  swapInAmount: BN;
  consumedInAmount: BN;
  swapOutAmount: BN;
  minSwapOutAmount: BN;
  totalFee: BN;
  priceImpact: number;
}>
```

#### Parameters
```typescript
interface GetQuoteParams {
  inAmount: BN;                // The amount of input token to swap
  inputTokenMint: PublicKey;   // The mint of the input token
  slippage: number;            // Slippage tolerance in percentage (e.g., 0.5 for 0.5%)
  poolState: PoolState;        // The state of the pool
  currentTime: number;        // Current timestamp (for time-based fees)
  currentSlot: number;        // Current slot (for slot-based fees)
  inputTokenInfo?: {
    mint: Mint,
    currentEpoch: number
  };        // Token info for Token2022 transfer fee calculations
  outputTokenInfo?: {
    mint: Mint,
    currentEpoch: number
  };       // Token info for Token2022 transfer fee calculations
}
```

#### Returns
An object containing:
- `swapInAmount`: The original input amount
- `consumedInAmount`: The actual input amount used (after transfer fees)
- `swapOutAmount`: The expected output amount
- `minSwapOutAmount`: The minimum output amount accounting for slippage
- `totalFee`: The total fee to be paid
- `priceImpact`: The price impact of the swap as a percentage

#### Example
```typescript
const poolState = await cpAmm.fetchPoolState(poolAddress);
const currentSlot = await connection.getSlot();
const blockTime = await connection.getBlockTime(currentSlot);
const quote = await cpAmm.getQuote({
  inAmount: new BN(100_000_000), // 100 USDC
  inputTokenMint: usdcMint,
  slippage: 0.5, // 0.5% slippage
  poolState,
  currentTime: blockTime,
  currentSlot
});

console.log(`Expected output: ${quote.swapOutAmount.toString()}`);
console.log(`Minimum output: ${quote.minSwapOutAmount.toString()}`);
console.log(`Fee: ${quote.totalFee.toString()}`);
console.log(`Price impact: ${quote.priceImpact.toFixed(2)}%`);
```

#### Notes
- Always check the price impact before executing a swap
- The `slippage` parameter protects users from price movements
- Use the `minSwapOutAmount` as the `minimumAmountOut` parameter for `swap`
- For Token2022 tokens with transfer fees, provide the token info parameters

---

### getDepositQuote

Calculates the deposit quote for adding liquidity to a pool based on a single token input.

#### Function
```typescript
async getDepositQuote(params: GetDepositQuoteParams): Promise<DepositQuote>
```

#### Parameters
```typescript
interface GetDepositQuoteParams {
  inAmount: BN;                 // The amount of input token
  isTokenA: boolean;            // Whether the input token is token A
  minSqrtPrice: BN;             // Minimum sqrt price
  maxSqrtPrice: BN;             // Maximum sqrt price
  sqrtPrice: BN;                // Current sqrt price
  inputTokenInfo?: {
    mint: Mint,
    currentEpoch: number
  };        // Token info for Token2022 transfer fee calculations
  outputTokenInfo?: {
    mint: Mint,
    currentEpoch: number
  };       // Token info for Token2022 transfer fee calculations
}
```

#### Returns
An object containing:
- `actualInputAmount`: The actual input amount (after transfer fees)
- `consumedInputAmount`: The full input amount including transfer fees
- `liquidityDelta`: The amount of liquidity that will be added
- `outputAmount`: The calculated amount of the other token to be paired

#### Example
```typescript
const poolState = await cpAmm.fetchPoolState(poolAddress);

const depositQuote = await cpAmm.getDepositQuote({
  inAmount: new BN(1_000_000_000), // 1,000 USDC
  isTokenA: true, // USDC is token A
  minSqrtPrice: poolState.sqrtMinPrice,
  maxSqrtPrice: poolState.sqrtMaxPrice,
  sqrtPrice: poolState.sqrtPrice
});

console.log(`Liquidity delta: ${depositQuote.liquidityDelta.toString()}`);
console.log(`Required token B: ${depositQuote.outputAmount.toString()}`);
```

#### Notes
- Use this to calculate how much of token B is needed when adding token A (or vice versa)
- Particularly useful for single-sided liquidity provision
- The function handles Token2022 transfer fees if token info is provided

---

### getWithdrawQuote

Calculates the withdrawal quote for removing liquidity from a pool.

#### Function
```typescript
async getWithdrawQuote(params: GetWithdrawQuoteParams): Promise<WithdrawQuote>
```

#### Parameters
```typescript
interface GetWithdrawQuoteParams {
  liquidityDelta: BN;         // The amount of liquidity to withdraw
  sqrtPrice: BN;              // Current sqrt price
  maxSqrtPrice: BN;           // Maximum sqrt price
  minSqrtPrice: BN;           // Minimum sqrt price
  inputTokenInfo?: {
    mint: Mint,
    currentEpoch: number
  };        // Token info for Token2022 transfer fee calculations
  outputTokenInfo?: {
    mint: Mint,
    currentEpoch: number
  };       // Token info for Token2022 transfer fee calculations
}
```

#### Returns
An object containing:
- `liquidityDelta`: The amount of liquidity being removed
- `outAmountA`: The calculated amount of token A to receive
- `outAmountB`: The calculated amount of token B to receive

#### Example
```typescript
const poolState = await cpAmm.fetchPoolState(poolAddress);
const positionState = await cpAmm.fetchPositionState(positionAddress);

// Calculate quote for removing half the liquidity
const liquidityToRemove = positionState.liquidity.div(new BN(2));

const withdrawQuote = await cpAmm.getWithdrawQuote({
  liquidityDelta: liquidityToRemove,
  sqrtPrice: poolState.sqrtPrice,
  minSqrtPrice: poolState.sqrtMinPrice,
  maxSqrtPrice: poolState.sqrtMaxPrice,
});

console.log(`Expected token A: ${withdrawQuote.outAmountA.toString()}`);
console.log(`Expected token B: ${withdrawQuote.outAmountB.toString()}`);
```

#### Notes
- Use this to estimate the tokens you'll receive when removing liquidity
- The function handles Token2022 transfer fees if token info is provided
- The calculation accounts for the current price relative to the position's price range

---

### swap

Executes a token swap in the pool.

#### Function
```typescript
async swap(params: SwapParams): TxBuilder
```

#### Parameters
```typescript
interface SwapParams {
  payer: PublicKey;              // The wallet paying for the transaction
  pool: PublicKey;               // Address of the pool to swap in
  inputTokenMint: PublicKey;     // Mint of the input token
  outputTokenMint: PublicKey;    // Mint of the output token
  amountIn: BN;                  // Amount of input token to swap
  minimumAmountOut: BN;          // Minimum amount of output token (slippage protection)
  tokenAVault: PublicKey;        // Pool's token A vault
  tokenBVault: PublicKey;        // Pool's token B vault
  tokenAMint: PublicKey;         // Pool's token A mint
  tokenBMint: PublicKey;         // Pool's token B mint
  tokenAProgram: PublicKey;      // Token program for token A
  tokenBProgram: PublicKey;      // Token program for token B
  referralTokenAccount?: PublicKey; // Optional referral account for fees
}
```

#### Returns
A transaction builder (`TxBuilder`) that can be used to build, sign, and send the transaction.

#### Example
```typescript
const poolState = await cpAmm.fetchPoolState(poolAddress);
const currentSlot = await connection.getSlot();
const blockTime = await connection.getBlockTime(currentSlot);
// Get quote first
const quote = await cpAmm.getQuote({
  inAmount: new BN(100_000_000), // 100 USDC
  inputTokenMint: poolState.tokenAMint,
  slippage: 0.5,
  poolState,
  currentTime: blockTime,
  currentSlot
});

// Execute swap
const swapTx = await cpAmm.swap({
  payer: wallet.publicKey,
  pool: poolAddress,
  inputTokenMint: poolState.tokenAMint,
  outputTokenMint: poolState.tokenBMint,
  amountIn: new BN(100_000_000),
  minimumAmountOut: quote.minSwapOutAmount,
  tokenAVault: poolState.tokenAVault,
  tokenBVault: poolState.tokenBVault,
  tokenAMint: poolState.tokenAMint,
  tokenBMint: poolState.tokenBMint,
  tokenAProgram: TOKEN_PROGRAM_ID,
  tokenBProgram: TOKEN_PROGRAM_ID
});
```

#### Notes
- Get a quote first using `getQuote` to determine the `minimumAmountOut`
- The SDK handles wrapping/unwrapping of SOL automatically
- Token accounts are created automatically if they don't exist
- The transaction will fail if the output amount would be less than `minimumAmountOut`
- Optional referral tokenAccount will receive a portion of fees if the pool is configured for referrals

---

### addLiquidity

Adds liquidity to an existing position.

#### Function
```typescript
async addLiquidity(params: AddLiquidityParams): TxBuilder
```

#### Parameters
```typescript
interface AddLiquidityParams {
  owner: PublicKey;              // The owner of the position
  pool: PublicKey;               // The pool address
  position: PublicKey;           // The position address
  positionNftAccount: PublicKey; // The ata account of position nft
  liquidityDelta: BN;            // The amount of liquidity to add in Q64 format
  maxAmountTokenA: BN;           // Maximum amount of token A to use
  maxAmountTokenB: BN;           // Maximum amount of token B to use
  tokenAAmountThreshold: BN;     // Minimum acceptable token A amount (slippage protection)
  tokenBAmountThreshold: BN;     // Minimum acceptable token B amount (slippage protection)
  tokenAMint: PublicKey;         // The mint of token A
  tokenBMint: PublicKey;         // The mint of token B
  tokenAVault: PublicKey;        // The pool's token A vault
  tokenBVault: PublicKey;        // The pool's token B vault
  tokenAProgram: PublicKey;      // Token program for token A
  tokenBProgram: PublicKey;      // Token program for token B
}
```

#### Returns
A transaction builder (`TxBuilder`) that can be used to build, sign, and send the transaction.

#### Example
```typescript
const poolState = await cpAmm.fetchPoolState(poolAddress);
const positionState = await cpAmm.fetchPositionState(positionAddress);

// Get deposit quote
const depositQuote = await cpAmm.getDepositQuote({
  inAmount: new BN(1_000_000_000), // 1,000 USDC
  isTokenA: true,
  minSqrtPrice: poolState.sqrtMinPrice,
  maxSqrtPrice: poolState.sqrtMaxPrice,
  sqrtPrice: poolState.sqrtPrice
});

// Add liquidity
const addLiquidityTx = await cpAmm.addLiquidity({
  owner: wallet.publicKey,
  pool: poolAddress,
  position: positionAddress,
  positionNftAccount: positionNftAccount,
  liquidityDelta: depositQuote.liquidityDelta,
  maxAmountTokenA: new BN(1_000_000_000),
  maxAmountTokenB: depositQuote.outputAmount,
  tokenAAmountThreshold: maxAmountTokenA,
  tokenBAmountThreshold: maxAmountTokenB,
  tokenAMint: poolState.tokenAMint,
  tokenBMint: poolState.tokenBMint,
  tokenAVault: poolState.tokenAVault,
  tokenBVault: poolState.tokenBVault,
  tokenAProgram,
  tokenBProgram
});
```

#### Notes
- Calculate the liquidity delta first using `getDepositQuote`
- The SDK handles wrapping/unwrapping of SOL automatically
- Token accounts are created automatically if they don't exist
- Set appropriate thresholds to protect against slippage

---

### removeLiquidity

Removes a specific amount of liquidity from an existing position.

#### Function
```typescript
async removeLiquidity(params: RemoveLiquidityParams): TxBuilder
```

#### Parameters
```typescript
interface RemoveLiquidityParams {
  owner: PublicKey;              // The owner of the position
  pool: PublicKey;               // The pool address
  position: PublicKey;           // The position address
  positionNftAccount?: PublicKey; // The position NFT account
  liquidityDelta: BN;           // The amount of liquidity to remove in Q64 format
  tokenAAmountThreshold: BN;     // Minimum acceptable token A amount (slippage protection)
  tokenBAmountThreshold: BN;     // Minimum acceptable token B amount (slippage protection)
  tokenAMint: PublicKey;         // The mint of token A
  tokenBMint: PublicKey;         // The mint of token B
  tokenAVault: PublicKey;        // The pool's token A vault
  tokenBVault: PublicKey;        // The pool's token B vault
  tokenAProgram: PublicKey;      // Token program for token A
  tokenBProgram: PublicKey;      // Token program for token B
  vestings?: Array<{account: PublicKey}>; // Optional vesting accounts to refresh
}
```

#### Returns
A transaction builder (`TxBuilder`) that can be used to build, sign, and send the transaction.

#### Example
```typescript
const poolState = await cpAmm.fetchPoolState(poolAddress);
const positionState = await cpAmm.fetchPositionState(positionAddress);

// Get withdraw quote for half of the liquidity
const liquidityToRemove = positionState.unlockedLiquidity.div(new BN(2));
const withdrawQuote = await cpAmm.getWithdrawQuote({
  liquidityDelta: liquidityToRemove,
  sqrtPrice: poolState.sqrtPrice,
  minSqrtPrice: poolState.sqrtMinPrice,
  maxSqrtPrice: poolState.sqrtMaxPrice,
});

const removeLiquidityTx = await cpAmm.removeLiquidity({
  owner: wallet.publicKey,
  pool: poolAddress,
  position: positionAddress,
  positionNftAccount: positionNftAccount,
  liquidityDelta: liquidityToRemove,
  tokenAAmountThreshold: new BN(0),
  tokenBAmountThreshold: new BN(0),
  tokenAMint: poolState.tokenAMint,
  tokenBMint: poolState.tokenBMint,
  tokenAVault: poolState.tokenAVault,
  tokenBVault: poolState.tokenBVault,
  tokenAProgram,
  tokenBProgram
});
```

#### Notes
- You can only remove unlocked liquidity
- The SDK handles wrapping/unwrapping of SOL automatically
- Token accounts are created automatically if they don't exist
- Set appropriate thresholds to protect against slippage
- Removing all liquidity doesn't close the position

---

### removeAllLiquidity

Removes all available liquidity from a position.

#### Function
```typescript
async removeAllLiquidity(params: RemoveAllLiquidityParams): TxBuilder
```

#### Parameters
```typescript
interface RemoveAllLiquidityParams {
  owner: PublicKey;              // The owner of the position
  pool: PublicKey;               // The pool address
  position: PublicKey;           // The position address
  positionNftAccount: PublicKey; // The ata account of position nft
  tokenAAmountThreshold: BN;     // Minimum acceptable token A amount (slippage protection)
  tokenBAmountThreshold: BN;     // Minimum acceptable token B amount (slippage protection)
  tokenAMint: PublicKey;         // The mint of token A
  tokenBMint: PublicKey;         // The mint of token B
  tokenAVault: PublicKey;        // The pool's token A vault
  tokenBVault: PublicKey;        // The pool's token B vault
  tokenAProgram: PublicKey;      // Token program for token A
  tokenBProgram: PublicKey;      // Token program for token B
  vestings?: Array<{account: PublicKey}>; // Optional vesting accounts to refresh if position has vesting lock
}
```

#### Returns
A transaction builder (`TxBuilder`) that can be used to build, sign, and send the transaction.

#### Example
```typescript
const poolState = await cpAmm.fetchPoolState(poolAddress);
const positionState = await cpAmm.fetchPositionState(positionAddress);

const removeAllLiquidityTx = await cpAmm.removeAllLiquidity({
  owner: wallet.publicKey,
  pool: poolAddress,
  position: positionAddress,
  positionNftAccount: positionNftAccount,
  tokenAAmountThreshold: new BN(0),
  tokenBAmountThreshold: new BN(0),
  tokenAMint: poolState.tokenAMint,
  tokenBMint: poolState.tokenBMint,
  tokenAVault: poolState.tokenAVault,
  tokenBVault: poolState.tokenBVault,
  tokenAProgram,
  tokenBProgram
});
```

#### Notes
- This removes all unlocked liquidity in one transaction
- The position remains open after removing all liquidity
- You can't remove locked liquidity (use `refreshVesting` first if needed)
- The SDK handles wrapping/unwrapping of SOL automatically

---

### removeAllLiquidityAndClosePosition

Removes all liquidity from a position and closes it in a single transaction.

#### Function
```typescript
async removeAllLiquidityAndClosePosition(params: RemoveAllLiquidityAndClosePositionParams): TxBuilder
```

#### Parameters
```typescript
interface RemoveAllLiquidityAndClosePositionParams {
  owner: PublicKey;                // The owner of the position
  position: PublicKey;             // The position address
  positionNftAccount: PublicKey;   // The position NFT account
  positionState: PositionState;    // The current position state
  poolState: PoolState;            // The current pool state
  tokenAAmountThreshold: BN;       // Minimum acceptable token A amount (slippage protection)
  tokenBAmountThreshold: BN;       // Minimum acceptable token B amount (slippage protection)
  currentPoint: BN;               // Current timestamp or slot number for vesting calculations
  vestings?: Array<{account: PublicKey, vestingState: VestingState}>; // Optional vesting accounts
}
```

#### Returns
A transaction builder (`TxBuilder`) that can be used to build, sign, and send the transaction.

#### Example
```typescript
const poolState = await cpAmm.fetchPoolState(poolAddress);
const positionState = await cpAmm.fetchPositionState(positionAddress);

// Check if position is locked
if (cpAmm.isLockedPosition(positionState)) {
  console.error("Cannot close a locked position");
  return;
}

// Build transaction to remove all liquidity and close position
const tx = await cpAmm.removeAllLiquidityAndClosePosition({
  owner: wallet.publicKey,
  position: positionAddress,
  positionNftAccount: positionNftAccount,
  positionState: positionState,
  poolState: poolState,
  tokenAAmountThreshold: new BN(0),
  tokenBAmountThreshold: new BN(0)
});
```

#### Notes
- This combines multiple operations in a single transaction:
  1. Claims any accumulated fees
  2. Removes all liquidity
  3. Closes the position and returns the rent
- The position must be completely unlocked
- The function will throw an error if the position has any locked liquidity
- This is more gas-efficient than doing these operations separately
- If there are vesting schedules, they must be refreshed before closing the position

---

### mergePosition

Merges liquidity from one position into another in a single transaction.

#### Function
```typescript
async mergePosition(params: MergePositionParams): TxBuilder
```

#### Parameters
```typescript
interface MergePositionParams {
  owner: PublicKey;                       // The owner of both positions
  positionA: PublicKey;                   // Target position to merge into
  positionB: PublicKey;                   // Source position to merge from
  positionBState: PositionState;          // State of the source position
  poolState: PoolState;                   // State of the pool
  positionANftAccount: PublicKey;         // ata account of target position NFT
  positionBNftAccount: PublicKey;         // ata account of source position NFT
  tokenAAmountAddLiquidityThreshold: BN;  // Minimum token A amount for add liquidity
  tokenBAmountAddLiquidityThreshold: BN;  // Minimum token B amount for add liquidity
  tokenAAmountRemoveLiquidityThreshold: BN; // Minimum token A amount for remove liquidity
  tokenBAmountRemoveLiquidityThreshold: BN; // Minimum token B amount for remove liquidity
  currentPoint: BN;                       // Current timestamp or slot number for vesting calculations
  positionBVestings?: Array<{account: PublicKey, vestingState: VestingState}>; // Optional vesting accounts for position B
}
```

#### Returns
A transaction builder (`TxBuilder`) that can be used to build, sign, and send the transaction.

#### Example
```typescript
const poolState = await cpAmm.fetchPoolState(poolAddress);
const positionAState = await cpAmm.fetchPositionState(positionAAddress); // Target position
const positionBState = await cpAmm.fetchPositionState(positionBAddress); // Source position to merge from

// Check if position is locked
if (cpAmm.isLockedPosition(positionBState)) {
  console.error("Cannot merge a locked position");
  return;
}

// Build transaction to merge positions
const tx = await cpAmm.mergePosition({
  owner: wallet.publicKey,
  positionA: positionAAddress,
  positionB: positionBAddress,
  positionBState: positionBState,
  poolState: poolState,
  positionANftAccount: positionANftAccount,
  positionBNftAccount: positionBNftAccount,
  tokenAAmountAddLiquidityThreshold: new BN(U64_MAX),
  tokenBAmountAddLiquidityThreshold: new BN(u64_MAX),
  tokenAAmountRemoveLiquidityThreshold: new BN(0),
  tokenBAmountRemoveLiquidityThreshold: new BN(0)
});
```

#### Notes
- This function combines multiple operations:
  1. Claims any accumulated fees from the source position
  2. Removes all liquidity from the source position
  3. Adds the liquidity to the target position
  4. Closes the source position
- Both positions must be owned by the same wallet
- The source position must be completely unlocked
- This is more gas-efficient than performing these operations separately
- Set appropriate thresholds to protect against slippage for both add and remove operations

---

### lockPosition

Builds a transaction to lock a position with vesting schedule.

#### Function
```typescript
async lockPosition(params: LockPositionParams): TxBuilder
```

#### Parameters
```typescript
interface LockPositionParams {
  owner: PublicKey;           // The owner of the position
  pool: PublicKey;            // The pool address
  payer: PublicKey;           // The wallet paying for the transaction
  vestingAccount: PublicKey;  // The vesting account to create
  position: PublicKey;        // The position address
  positionNftAccount: PublicKey; // The position NFT account
  cliffPoint: BN | null;             // The cliff point (slot or timestamp)
  periodFrequency: BN;        // How often liquidity unlocks
  cliffUnlockLiquidity: BN;   // Amount to unlock at cliff
  liquidityPerPeriod: BN;     // Amount to unlock per period
  numberOfPeriod: number;     // Number of vesting periods
}
```

#### Returns
A transaction builder (`TxBuilder`) that can be used to build, sign, and send the transaction.

#### Example
```typescript
const vestingAccount = Keypair.generate();

const lockPositionTx = await cpAmm.lockPosition({
  owner: wallet.publicKey,
  pool: poolAddress,
  payer: wallet.publicKey,
  vestingAccount: vestingAccount.publicKey,
  position: positionAddress,
  positionNftAccount: positionNftAccount,
  cliffPoint: new BN(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days cliff
  periodFrequency: new BN(24 * 60 * 60 * 1000), // 1 day periods
  cliffUnlockLiquidity: new BN(0), // No initial unlock
  liquidityPerPeriod: positionState.unlockedLiquidity.div(new BN(30)), // Unlock over 30 days
  numberOfPeriod: 30 // 30 periods
});
```

#### Notes
- Locking positions is useful for creating various incentive mechanisms
- The vesting schedule controls how quickly liquidity unlocks over time
- Locked liquidity cannot be withdrawn until it becomes unlocked
- The vesting account is a new account that must be created
- The function only locks currently unlocked liquidity

---

### permanentLockPosition

Permanently locks a portion of liquidity in a position.

#### Function
```typescript
async permanentLockPosition(params: PermanentLockParams): TxBuilder
```

#### Parameters
```typescript
interface PermanentLockParams {
  owner: PublicKey;             // The owner of the position
  position: PublicKey;          // The position address
  positionNftAccount: PublicKey; // The position NFT account
  pool: PublicKey;              // The pool address
  unlockedLiquidity: BN;        // Amount of liquidity to permanently lock
}
```

#### Returns
A transaction builder (`TxBuilder`) that can be used to build, sign, and send the transaction.

#### Example
```typescript
const positionState = await cpAmm.fetchPositionState(positionAddress);

// Permanently lock half of the unlocked liquidity
const liquidityToLock = positionState.unlockedLiquidity.div(new BN(2));

const lockTx = await cpAmm.permanentLockPosition({
  owner: wallet.publicKey,
  position: positionAddress,
  positionNftAccount: positionNftAccount,
  pool: poolAddress,
  unlockedLiquidity: liquidityToLock
});
```

#### Notes
- Permanently locked liquidity can never be withdrawn
- This is useful for deep liquidity protocols or governance mechanisms
- Once liquidity is permanently locked, this action cannot be reversed
- The owner can still collect fees from permanently locked liquidity

---

### refreshVesting

Refreshes vesting status of a position to unlock available liquidity.

#### Function
```typescript
async refreshVesting(params: RefreshVestingParams): TxBuilder
```

#### Parameters
```typescript
interface RefreshVestingParams {
  owner: PublicKey;               // The owner of the position
  position: PublicKey;            // The position address
  positionNftAccount: PublicKey;  // The position NFT account
  pool: PublicKey;                // The pool address
  vestingAccounts: PublicKey[];   // Array of vesting accounts to refresh
}
```

#### Returns
A transaction builder (`TxBuilder`) that can be used to build, sign, and send the transaction.

#### Example
```typescript
// Get all vesting accounts for the position
const vestings = await cpAmm.getAllVestingsByPosition(positionAddress);

const refreshVestingTx = await cpAmm.refreshVesting({
  owner: wallet.publicKey,
  position: positionAddress,
  positionNftAccount: positionNftAccount,
  pool: poolAddress,
  vestingAccounts: vestings.map(v => v.publicKey)
});
```

#### Notes
- Call this function to update the vesting state and unlock available liquidity
- Should be called periodically to ensure liquidity is properly unlocked
- If all liquidity is unlocked, the vesting account remains but is no longer used
- Must be called before removing liquidity if position has vesting accounts

---

### claimPositionFee

Claims accumulated fees for a position.

#### Function
```typescript
async claimPositionFee(params: ClaimPositionFeeParams): TxBuilder
```

#### Parameters
```typescript
interface ClaimPositionFeeParams {
  owner: PublicKey;               // The owner of the position
  pool: PublicKey;                // The pool address
  position: PublicKey;            // The position address
  positionNftAccount: PublicKey;  // The position NFT account
  tokenAVault: PublicKey;         // The pool's token A vault
  tokenBVault: PublicKey;         // The pool's token B vault
  tokenAMint: PublicKey;          // The mint of token A
  tokenBMint: PublicKey;          // The mint of token B
  tokenAProgram: PublicKey;       // Token program for token A
  tokenBProgram: PublicKey;       // Token program for token B
  receiver?: Pubkey;              // the wallet that will receive the fees (optional)
  tempWSolAccount?: Pubkey;       // the temporary wallet that will receive the fees (optional)
}
```

#### Returns
A transaction builder (`TxBuilder`) that can be used to build, sign, and send the transaction.

#### Example
```typescript
const poolState = await cpAmm.fetchPoolState(poolAddress);

const claimFeeTx = await cpAmm.claimPositionFee({
  owner: wallet.publicKey,
  pool: poolAddress,
  position: positionAddress,
  positionNftAccount: positionNftAccount,
  tokenAVault: poolState.tokenAVault,
  tokenBVault: poolState.tokenBVault,
  tokenAMint: poolState.tokenAMint,
  tokenBMint: poolState.tokenBMint,
  tokenAProgram,
  tokenBProgram
});
```

#### Notes
- Fees are collected when trades occur in the pool
- Only the position owner can claim fees
- Fees are earned on both token A and token B based on the amount of liquidity provided
- Fees accumulate over time and should be claimed periodically
- The SDK handles wrapping/unwrapping of SOL automatically


### claimPositionFee2

Claims accumulated fees for a position. 

#### Function
```typescript
async claimPositionFee2(params: ClaimPositionFeeParams2): TxBuilder
```

#### Parameters
```typescript
interface ClaimPositionFeeParams {
  owner: PublicKey;               // The owner of the position
  pool: PublicKey;                // The pool address
  position: PublicKey;            // The position address
  positionNftAccount: PublicKey;  // The position NFT account
  tokenAVault: PublicKey;         // The pool's token A vault
  tokenBVault: PublicKey;         // The pool's token B vault
  tokenAMint: PublicKey;          // The mint of token A
  tokenBMint: PublicKey;          // The mint of token B
  tokenAProgram: PublicKey;       // Token program for token A
  tokenBProgram: PublicKey;       // Token program for token B
  receiver: Pubkey;              //  The wallet that will receive the fees
  feePayer?: PublicKey;          // Specific fee payer for transaction. Default fee payer is position's owner
}
```

#### Returns
A transaction builder (`TxBuilder`) that can be used to build, sign, and send the transaction.

#### Example
```typescript
const poolState = await cpAmm.fetchPoolState(poolAddress);

const claimFeeTx = await cpAmm.claimPositionFee2({
  owner: wallet.publicKey,
  pool: poolAddress,
  position: positionAddress,
  receiver: receiverAddress,
  positionNftAccount: positionNftAccount,
  tokenAVault: poolState.tokenAVault,
  tokenBVault: poolState.tokenBVault,
  tokenAMint: poolState.tokenAMint,
  tokenBMint: poolState.tokenBMint,
  tokenAProgram,
  tokenBProgram
});
```

#### Notes
- Fees are collected when trades occur in the pool
- Only the position owner can claim fees
- Fees will claim to receiver address
- Fees are earned on both token A and token B based on the amount of liquidity provided
- The SDK handles wrapping/unwrapping of SOL automatically

---

### claimPartnerFee

Claims partner fee rewards.

#### Function
```typescript
async claimPartnerFee(params: ClaimPartnerFeeParams): TxBuilder
```

#### Parameters
```typescript
interface ClaimPartnerFeeParams {
  partner: PublicKey;         // Partner address to receive fees
  pool: PublicKey;            // The pool address
  maxAmountA: BN;             // Maximum amount of token A to claim
  maxAmountB: BN;             // Maximum amount of token B to claim
}
```

#### Returns
A transaction builder (`TxBuilder`) that can be used to build, sign, and send the transaction.

#### Example
```typescript
const poolState = await cpAmm.fetchPoolState(poolAddress);

const claimPartnerFeeTx = await cpAmm.claimPartnerFee({
  partner: partnerWallet.publicKey,
  pool: poolAddress,
  maxAmountA: new BN(1_000_000_000), // 1,000 USDC
  maxAmountB: new BN(5_000_000_000)  // 5 SOL
});
```

#### Notes
- Partner fees are a portion of trading fees directed to a specific account
- Only the configured partner address can claim these fees
- Partner fees must be enabled in the pool configuration
- The SDK handles wrapping/unwrapping of SOL automatically
- Token accounts are created automatically if they don't exist

---

### claimReward

Claims reward tokens from a position.

#### Function
```typescript
async claimReward(params: ClaimRewardParams): TxBuilder
```

#### Parameters
```typescript
interface ClaimRewardParams {
  user: PublicKey;               // The user claiming rewards
  position: PublicKey;           // The position address
  positionNftAccount: PublicKey; // The position NFT account
  rewardIndex: number;           // Index of the reward to claim
  poolState: PoolState;          // The current pool state
  positionState: PositionState;  // The current position state
}
```

#### Returns
A transaction builder (`TxBuilder`) that can be used to build, sign, and send the transaction.

#### Example
```typescript
const poolState = await cpAmm.fetchPoolState(poolAddress);
const positionState = await cpAmm.fetchPositionState(positionAddress);

// Claim reward at index 0
const claimRewardTx = await cpAmm.claimReward({
  user: wallet.publicKey,
  position: positionAddress,
  positionNftAccount: positionNftAccount,
  rewardIndex: 0,
  poolState: poolState,
  positionState: positionState
});
```

#### Notes
- Pools can have multiple reward tokens configured
- The rewardIndex parameter specifies which reward token to claim
- Rewards accrue based on the amount of liquidity provided and duration
- Only the position owner can claim rewards
- The SDK handles wrapping/unwrapping of SOL automatically

---

### closePosition

Closes a position with no liquidity.

#### Function
```typescript
async closePosition(params: ClosePositionParams): TxBuilder
```

#### Parameters
```typescript
interface ClosePositionParams {
  owner: PublicKey;               // The owner of the position
  pool: PublicKey;                // The pool address
  position: PublicKey;            // The position address
  positionNftMint: PublicKey;     // The position NFT mint
  positionNftAccount: PublicKey;  // The position NFT account
}
```

#### Returns
A transaction builder (`TxBuilder`) that can be used to build, sign, and send the transaction.

#### Example
```typescript
const positionState = await cpAmm.fetchPositionState(positionAddress);

// Check if position has no liquidity
if (!positionState.unlockedLiquidity.isZero() || !positionState.vestedLiquidity.isZero() || !positionState.permanentLockedLiquidity.isZero()) {
  console.error("Position still has liquidity");
  return;
}

const closePositionTx = await cpAmm.closePosition({
  owner: wallet.publicKey,
  pool: positionState.pool,
  position: positionAddress,
  positionNftMint: positionState.nftMint,
  positionNftAccount: positionNftAccount
});
```

#### Notes
- Position must have zero liquidity before closing
- Use `removeAllLiquidity` first if the position still has liquidity
- Closing a position returns the rent to the owner
- This function only closes the position account, not the NFT
- For a full cleanup, use `removeAllLiquidityAndClosePosition` instead

---

## State Functions

### fetchConfigState

Fetches the Config state of the program.

#### Function
```typescript
async fetchConfigState(config: PublicKey): Promise<ConfigState>
```

#### Parameters
- `config`: Public key of the config account.

#### Returns
Parsed ConfigState.

#### Example
```typescript
const configState = await cpAmm.fetchConfigState(configAddress);
console.log(configState);
```

#### Notes
- Throws an error if the config account does not exist

---

### fetchPoolState

Fetches the Pool state.

#### Function
```typescript
async fetchPoolState(pool: PublicKey): Promise<PoolState>
```

#### Parameters
- `pool`: Public key of the pool.

#### Returns
Parsed PoolState.

#### Example
```typescript
const poolState = await cpAmm.fetchPoolState(poolAddress);
console.log(`Current Price: ${poolState.sqrtPrice.toString()}`);
console.log(`Liquidity: ${poolState.liquidity.toString()}`);
```

#### Notes
- Throws an error if the pool account does not exist
- Contains all essential information about the pool including prices, liquidity, and fees

---

### fetchPositionState

Fetches the Position state.

#### Function
```typescript
async fetchPositionState(position: PublicKey): Promise<PositionState>
```

#### Parameters
- `position`: Public key of the position.

#### Returns
Parsed PositionState.

#### Example
```typescript
const positionState = await cpAmm.fetchPositionState(positionAddress);
console.log(`Unlocked Liquidity: ${positionState.unlockedLiquidity.toString()}`);
console.log(`Vested Liquidity: ${positionState.vestedLiquidity.toString()}`);
console.log(`Permanent Locked Liquidity: ${positionState.permanentLockedLiquidity.toString()}`);
```

#### Notes
- Throws an error if the position account does not exist
- Contains information about liquidity amounts, fee collection, and rewards

---

### getAllConfigs

Retrieves all config accounts.

#### Function
```typescript
async getAllConfigs(): Promise<Array<{ publicKey: PublicKey; account: ConfigState }>>
```

#### Returns
Array of config public keys and their states.

#### Example
```typescript
const configs = await cpAmm.getAllConfigs();
console.log(`Found ${configs.length} configs`);
configs.forEach((config, i) => {
  console.log(`Config ${i}: ${config.publicKey.toString()}`);
});
```

---

### getAllPools

Retrieves all pool accounts.

#### Function
```typescript
async getAllPools(): Promise<Array<{ publicKey: PublicKey; account: PoolState }>>
```

#### Returns
Array of pool public keys and their states.

#### Example
```typescript
const pools = await cpAmm.getAllPools();
console.log(`Found ${pools.length} pools`);
pools.forEach((pool, i) => {
  console.log(`Pool ${i}: ${pool.publicKey.toString()}`);
  console.log(`- Token A: ${pool.account.tokenAMint.toString()}`);
  console.log(`- Token B: ${pool.account.tokenBMint.toString()}`);
});
```

---

### getAllPositions

Retrieves all position accounts.

#### Function
```typescript
async getAllPositions(): Promise<Array<{ publicKey: PublicKey; account: PositionState }>>
```

#### Returns
Array of position public keys and their states.

#### Example
```typescript
const positions = await cpAmm.getAllPositions();
console.log(`Found ${positions.length} positions`);
```

---

### getAllPositionsByPool

Gets all positions for a specific pool.

#### Function
```typescript
async getAllPositionsByPool(pool: PublicKey): Promise<Array<{ publicKey: PublicKey; account: PositionState }>>
```

#### Parameters
- `pool`: Public key of the pool.

#### Returns
List of positions for the pool.

#### Example
```typescript
const poolPositions = await cpAmm.getAllPositionsByPool(poolAddress);
console.log(`Pool has ${poolPositions.length} positions`);
```

---

### getUserPositionByPool

Gets all positions of a user for a specific pool.

#### Function
```typescript
async getUserPositionByPool(pool: PublicKey, user: PublicKey): Promise<Array<{ positionNftAccount: PublicKey; position: PublicKey; positionState: PositionState }>>
```

#### Parameters
- `pool`: Public key of the pool.
- `user`: Public key of the user.

#### Returns
List of user positions for the pool.

#### Example
```typescript
const userPoolPositions = await cpAmm.getUserPositionByPool(poolAddress, wallet.publicKey);
console.log(`User has ${userPoolPositions.length} positions in this pool`);
```

---

### getPositionsByUser

Gets all positions of a user across all pools.

#### Function
```typescript
async getPositionsByUser(user: PublicKey): Promise<Array<{ positionNftAccount: PublicKey; position: PublicKey; positionState: PositionState }>>
```

#### Parameters
- `user`: Public key of the user.

#### Returns
Array of user positions already sorted by liquidity.

#### Example
```typescript
const userPositions = await cpAmm.getPositionsByUser(wallet.publicKey);
console.log(`User has ${userPositions.length} total positions`);
```

#### Notes
- Positions are sorted by total liquidity in descending order
- Returns position NFT accounts, position addresses, and full position states

---

### getAllVestingsByPosition

Retrieves all vesting accounts associated with a position.

#### Function
```typescript
async getAllVestingsByPosition(position: PublicKey): Promise<Array<{ publicKey: PublicKey; account: VestingState }>>
```

#### Parameters
- `position`: Public key of the position.

#### Returns
Array of vesting account public keys and their states.

#### Example
```typescript
const vestings = await cpAmm.getAllVestingsByPosition(positionAddress);
console.log(`Position has ${vestings.length} vesting accounts`);
```

---

### isLockedPosition

Checks if a position has any locked liquidity.

#### Function
```typescript
isLockedPosition(position: PositionState): boolean
```

#### Parameters
- `position`: The position state.

#### Returns
Boolean indicating whether the position has locked liquidity.

#### Example
```typescript
const positionState = await cpAmm.fetchPositionState(positionAddress);
if (cpAmm.isLockedPosition(positionState)) {
  console.log("Position has locked liquidity");
} else {
  console.log("Position has no locked liquidity");
}
```

---

### isPoolExist

Checks if a pool exists.

#### Function
```typescript
async isPoolExist(pool: PublicKey): Promise<boolean>
```

#### Parameters
- `pool`: Public key of the pool.

#### Returns
Boolean indicating whether the pool exists.

#### Example
```typescript
const exists = await cpAmm.isPoolExist(poolAddress);
if (exists) {
  console.log("Pool exists");
} else {
  console.log("Pool does not exist");
}
```

---

## Helper Functions

### preparePoolCreationParams

Prepares parameters required for pool creation, including initial sqrt price and liquidity.

#### Function
```typescript
preparePoolCreationParams(params: PreparePoolCreationParams): PreparedPoolCreation
```

#### Parameters
```typescript
interface PreparePoolCreationParams {
  tokenAAmount: BN;        // Initial amount of token A to deposit
  tokenBAmount: BN;        // Initial amount of token B to deposit
  minSqrtPrice: BN;        // Minimum sqrt price
  maxSqrtPrice: BN;        // Maximum sqrt price
  tokenAInfo?: any;        // Token info for Token2022 transfer fee calculations
  tokenBInfo?: any;        // Token info for Token2022 transfer fee calculations
}
```

#### Returns
An object containing:
- `initSqrtPrice`: The initial sqrt price in Q64 format
- `liquidityDelta`: The initial liquidity in Q64 format

#### Example
```typescript
const { initSqrtPrice, liquidityDelta } = cpAmm.preparePoolCreationParams({
  tokenAAmount: new BN(1_000_000_000), // 1,000 USDC with 6 decimals
  tokenBAmount: new BN(5_000_000_000), // 5 SOL with 9 decimals
  minSqrtPrice: MIN_SQRT_PRICE,
  maxSqrtPrice: MAX_SQRT_PRICE
});

console.log(`Initial sqrt price: ${initSqrtPrice.toString()}`);
console.log(`Initial liquidity: ${liquidityDelta.toString()}`);
```

#### Notes
- This function calculates the correct initial price and liquidity based on the token amounts
- Both token amounts must be greater than zero
- The function handles Token2022 transfer fees if token info is provided

### isVestingComplete

Checks if a vesting schedule is ready for full release.

#### Function
```typescript
function isVestingComplete(vestingData: VestingState, currentPoint: BN): boolean
```

#### Parameters
- `vestingData`: The vesting account state data
- `currentPoint`: Current timestamp or slot number

#### Returns
Boolean indicating whether the vesting schedule is complete and all liquidity can be released.

#### Example
```typescript
const vestings = await cpAmm.getAllVestingsByPosition(positionAddress);
if (vestings.length > 0) {
  const isComplete = isVestingComplete(vestings[0].account, new BN(Date.now()));
  if (isComplete) {
    console.log("Vesting schedule is complete, all liquidity can be released");
  } else {
    console.log("Vesting schedule is still active");
  }
}
```

#### Notes
- This function checks if the current point (timestamp or slot) has passed the end of the vesting schedule
- The end point is calculated as: cliffPoint + (periodFrequency * numberOfPeriods)
- Returns true if currentPoint >= endPoint, false otherwise
- Useful to determine if a position can be fully unlocked

---

### getTotalLockedLiquidity

Gets the total amount of liquidity in the vesting schedule.

#### Function
```typescript
function getTotalLockedLiquidity(vestingData: VestingState): BN
```

#### Parameters
- `vestingData`: The vesting account state data

#### Returns
The total locked liquidity amount as a BN.

#### Example
```typescript
const vestings = await cpAmm.getAllVestingsByPosition(positionAddress);
if (vestings.length > 0) {
  const totalLocked = getTotalLockedLiquidity(vestings[0].account);
  console.log(`Total locked liquidity: ${totalLocked.toString()}`);
}
```

#### Notes
- Calculates the sum of cliff unlock liquidity and periodic unlock liquidity
- Formula: cliffUnlockLiquidity + (liquidityPerPeriod * numberOfPeriod)
- This is the total amount of liquidity that was initially locked in the vesting schedule
- Does not account for already released liquidity

---

### getAvailableVestingLiquidity

Calculates the available liquidity to withdraw based on vesting schedule.

#### Function
```typescript
function getAvailableVestingLiquidity(vestingData: VestingState, currentPoint: BN): BN
```

#### Parameters
- `vestingData`: The vesting account state data
- `currentPoint`: Current timestamp or slot number

#### Returns
The amount of liquidity available to withdraw as a BN.

#### Example
```typescript
const vestings = await cpAmm.getAllVestingsByPosition(positionAddress);
if (vestings.length > 0) {
  const availableLiquidity = getAvailableVestingLiquidity(
    vestings[0].account,
    new BN(Date.now())
  );
  console.log(`Available liquidity to withdraw: ${availableLiquidity.toString()}`);
}
```

### getMaxAmountWithSlippage

Calculates the maximum amount after applying a slippage rate.

#### Function
```typescript
function getMaxAmountWithSlippage(amount: BN, rate: number): BN
```

#### Parameters
- `amount`: The base amount as a BN
- `rate`: The slippage rate as a percentage (e.g., 0.5 for 0.5%)

#### Returns
The maximum amount after applying slippage as a BN.

#### Example
```typescript
const tokenAmount = new BN(1_000_000_000); // 1,000 tokens
const slippageRate = 0.5; // 0.5% slippage allowance
const maxAmount = getMaxAmountWithSlippage(tokenAmount, slippageRate);
console.log(`Maximum amount with slippage: ${maxAmount.toString()}`);
```

#### Notes
- Used when you need to calculate the upper bound of an amount with slippage tolerance
- Formula: amount * (100 + rate) / 100
- Common use case: Setting a maximum deposit amount when adding liquidity
- Slippage rate is expressed as a percentage and supports up to 2 decimal places

---

### getMinAmountWithSlippage

Calculates the minimum amount after applying a slippage rate.

#### Function
```typescript
function getMinAmountWithSlippage(amount: BN, rate: number): BN
```

#### Parameters
- `amount`: The base amount as a BN
- `rate`: The slippage rate as a percentage (e.g., 0.5 for 0.5%)

#### Returns
The minimum amount after applying slippage as a BN.

#### Example
```typescript
const expectedOutput = new BN(1_000_000_000); // 1,000 tokens
const slippageRate = 0.5; // 0.5% slippage allowance
const minAmount = getMinAmountWithSlippage(expectedOutput, slippageRate);
console.log(`Minimum amount with slippage: ${minAmount.toString()}`);
```

#### Notes
- Used when you need to calculate the lower bound of an amount with slippage tolerance
- Formula: amount * (100 - rate) / 100
- Common use case: Setting a minimum output amount when swapping tokens
- Slippage rate is expressed as a percentage and supports up to 2 decimal places

---

### getPriceImpact

Calculates the price impact as a percentage.

#### Function
```typescript
function getPriceImpact(actualAmount: BN, idealAmount: BN): number
```

#### Parameters
- `actualAmount`: The actual amount after slippage in token units
- `idealAmount`: The theoretical amount without slippage in token units

#### Returns
The price impact as a percentage (e.g., 1.5 means 1.5%).

#### Example
```typescript
const idealAmount = new BN(1_000_000_000); // 1,000 tokens (theoretical)
const actualAmount = new BN(990_000_000);  // 990 tokens (actual)
const impact = getPriceImpact(actualAmount, idealAmount);
console.log(`Price impact: ${impact.toFixed(2)}%`);
```

#### Notes
- Used to express how much a transaction will affect the price
- Formula: ((idealAmount - actualAmount) / idealAmount) * 100
- Higher price impact indicates a greater effect on the market price
- Common use case: Showing users the effect of their swap on the pool

---

## Price Conversion Utilities

### getPriceFromSqrtPrice

Converts a sqrt price in Q64 format to a human-readable price.

#### Function
```typescript
function getPriceFromSqrtPrice(sqrtPrice: BN, tokenADecimal: number, tokenBDecimal: number): string
```

#### Parameters
- `sqrtPrice`: The sqrt price in Q64 format
- `tokenADecimal`: The number of decimals for token A
- `tokenBDecimal`: The number of decimals for token B

#### Returns
The price as a string in human-readable format.

#### Example
```typescript
const poolState = await cpAmm.fetchPoolState(poolAddress);
const price = getPriceFromSqrtPrice(
  poolState.sqrtPrice,
  6,  // USDC has 6 decimals
  9   // SOL has 9 decimals
);
console.log(`Current price: ${price} USDC per SOL`);
```

#### Notes
- Converts the internal sqrt price representation to a human-readable price
- Formula: (sqrtPrice >> 64)^2 * 10^(tokenADecimal - tokenBDecimal)
- The result represents the price of token B in terms of token A
- Useful for displaying current pool prices to users

---

### getSqrtPriceFromPrice

Converts a human-readable price to a sqrt price in Q64 format.

#### Function
```typescript
function getSqrtPriceFromPrice(price: string, tokenADecimal: number, tokenBDecimal: number): BN
```

#### Parameters
- `price`: The price as a string in human-readable format
- `tokenADecimal`: The number of decimals for token A
- `tokenBDecimal`: The number of decimals for token B

#### Returns
The sqrt price as a BN in Q64 format.

#### Example
```typescript
const price = "0.05"; // 0.05 USDC per SOL
const sqrtPrice = getSqrtPriceFromPrice(
  price,
  6,  // USDC has 6 decimals
  9   // SOL has 9 decimals
);
console.log(`Sqrt price in Q64 format: ${sqrtPrice.toString()}`);
```

#### Notes
- Converts a human-readable price to the internal sqrt price representation
- Formula: sqrt(price / 10^(tokenADecimal - tokenBDecimal)) << 64
- Useful when creating pools with a specific initial price
- Can be used to define price boundaries for concentrated liquidity positions

---

## Fee Calculation Utilities

### getUnClaimReward

Calculates unclaimed fees and rewards for a position.

#### Function
```typescript
function getUnClaimReward(poolState: PoolState, positionState: PositionState): {
  feeTokenA: BN;
  feeTokenB: BN;
  rewards: BN[];
}
```

#### Parameters
- `poolState`: The current state of the pool
- `positionState`: The current state of the position

#### Returns
An object containing:
- `feeTokenA`: Unclaimed fees in token A
- `feeTokenB`: Unclaimed fees in token B
- `rewards`: Array of unclaimed reward amounts for each reward token

#### Example
```typescript
const poolState = await cpAmm.fetchPoolState(poolAddress);
const positionState = await cpAmm.fetchPositionState(positionAddress);

const unclaimed = getUnClaimReward(poolState, positionState);
console.log(`Unclaimed token A fees: ${unclaimed.feeTokenA.toString()}`);
console.log(`Unclaimed token B fees: ${unclaimed.feeTokenB.toString()}`);
unclaimed.rewards.forEach((reward, i) => {
  console.log(`Unclaimed reward ${i}: ${reward.toString()}`);
});
```

### getBaseFeeNumerator

Calculates the current base fee numerator based on the configured fee scheduler mode and elapsed periods.
#### Function
```typescript
function getBaseFeeNumerator(
  feeSchedulerMode: FeeSchedulerMode,
  cliffFeeNumerator: BN,
  period: BN,
  reductionFactor: BN
): BN
```

#### Parameters
- `feeSchedulerMode`: The fee reduction mode (Linear or Exponential)
- `cliffFeeNumerator`: The initial maximum fee numerator (starting point)
- `period`: The number of elapsed periods since fee reduction began
- `reductionFactor`: The rate of fee reduction per period

#### Mathematical Formulas

**Linear Mode:**
```
fee = cliffFeeNumerator - (period × reductionFactor)
```

**Exponential Mode:**
```
fee = cliffFeeNumerator × (1 - reductionFactor/BASIS_POINT_MAX)^period
```

#### Returns
- `BN`: The calculated base fee numerator for the current period


### getDynamicFeeNumerator

Calculates a dynamic fee component based on market volatility

#### Function
```typescript
function getDynamicFeeNumerator(
  volatilityAccumulator: BN,
  binStep: BN,
  variableFeeControl: BN
): BN
```

#### Parameters
- `volatilityAccumulator`: Accumulated measure of market volatility over time
- `binStep`: The price bin step size used in the liquidity distribution system
- `variableFeeControl`: Control parameter that determines how much volatility affects fees

#### Mathematical Formula
```
squareVfaBin = (volatilityAccumulator × binStep)²
vFee = variableFeeControl × squareVfaBin
dynamicFee = (vFee + 99,999,999,999) ÷ 100,000,000,000
```

#### Returns
- `BN`: The calculated dynamic fee numerator
- Returns `0` if `variableFeeControl` is zero (dynamic fees disabled)

### bpsToFeeNumerator

Converts basis points to fee numerator format.

#### Formula
```
feeNumerator = (bps × FEE_DENOMINATOR) ÷ BASIS_POINT_MAX
```

### feeNumeratorToBps

Converts fee numerator back to basis points.

#### Formula
```
bps = (feeNumerator × BASIS_POINT_MAX) ÷ FEE_DENOMINATOR
```

### getBaseFeeParams

Calculates the initial parameters for a base fee

#### Key Features
- Supports both linear and exponential fee reduction
- Validates parameter consistency
- Calculates period frequency and reduction factors

### getDynamicFeeParams
Calculates the parameters needed for dynamic fee.

#### Key Features
- Configures volatility-based fee parameters
- Sets maximum price change thresholds
- Calculates variable fee control parameters