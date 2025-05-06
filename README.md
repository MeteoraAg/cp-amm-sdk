# Meteora Constant Product AMM SDK (DAMM V2 SDK)

A TypeScript SDK for interacting with the Dynamic CP-AMM on Meteora

## Overview

This SDK provides a set of tools and methods to interact with the [Meteora Dynamic CP-AMM](https://github.com/MeteoraAg/cp-amm). It simplifies common operations like creating pools, managing positions, adding/removing liquidity, swapping tokens, and claiming rewards.

For detailed technical documentation, please refer to the [CP-AMM SDK Documentation](https://github.com/MeteoraAg/cp-amm-sdk/blob/main/docs.md).

## Installation

```bash
pnpm install @meteora-ag/cp-amm-sdk
# or
yarn add @meteora-ag/cp-amm-sdk
```

### Initialization

```typescript
import { Connection } from "@solana/web3.js";
import { CpAmm } from "@meteora-ag/cp-amm-sdk";

// Initialize a connection to the Solana network
const connection = new Connection("https://api.mainnet-beta.solana.com");

// Create a new instance of the CpAmm SDK
const cpAmm = new CpAmm(connection);
```

### Test

```
pnpm install
pnpm test
```

### Run script
Example run script create config
```
npx ts-node scripts/createConfig.ts
```

Create private config
```
npx ts-node scripts/createPrivateConfig.ts
```

## Deployments

- Mainnet-beta: cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG
- Devnet: cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG

## Faucets

https://faucet.raccoons.dev/
