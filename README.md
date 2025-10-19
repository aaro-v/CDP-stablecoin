# CDP Stablecoin Contract

This repository contains a prototype implementation of a collateralised debt position (CDP) stablecoin system that locks a meme token as collateral. The design is inspired by the Synthetix sUSD pattern and enforces a 10:1 collateralisation requirement.

## Key Features

- **Collateral Management** – Users deposit and withdraw meme token collateral while maintaining the required 1000% collateral ratio.
- **Stablecoin Mint/Burn** – Mint `cUSD` against locked collateral and burn it to reduce or close debt positions.
- **Automated Rebalancing Hook** – Keeper-driven `rebalancePosition` function sells collateral through a DEX router when a position falls below 300% collateralisation, buys 2 `cUSD`, and burns it to stabilise the system.
- **Oracle Integration** – Chainlink-style price feed drives all ratio calculations and supports updates by the contract owner.
- **Exit Penalty** – When a user fully repays debt, 5% of the collateral is sent to the burn address to tighten circulating supply, consistent with the specification.

## Current Functionality

- Meme token collateral is locked per user position (`depositCollateral`) and can be withdrawn if the position remains above the 1000% minimum ratio.
- Stablecoin issuance pipeline (`mintStablecoin`, `burnStablecoin`, `repayAndClose`) handles minting, repayment, and exit including the 5% collateral burn on close.
- Health enforcement utilities (`collateralRatio`, `isHealthy`, `collateralValueUSD`, `getPosition`) expose live metrics derived from the configured oracle.
- Keeper-triggered liquidation flow (`rebalancePosition`) swaps collateral for 2 `cUSD` through a router path whenever a position falls under the 300% threshold.
- Admin controls (`setPriceFeed`, `setRouter`, `transferOwnership`) let governance update oracle/router endpoints without redeploying the core contract.
- Local Hardhat environment includes deploy script and mock collateral/oracle/router contracts to exercise the full lifecycle end-to-end.
- Automated Hardhat tests validate mint limits, collateral withdrawals, liquidation behaviour, and the 5% exit fee.
- Sepolia deployment script consumes live meme-token, Chainlink-style feed, and router addresses supplied through environment variables.
- Router liquidity seeding script (`seed-router-sepolia.js`) deposits collateral, mints cUSD, funds the router, and adjusts the oracle price for on-chain liquidation testing.
- Sepolia deployment verified on Etherscan to aid public review.

## Contract Layout

- `contracts/CDPStablecoin.sol` – Core implementation. Contains lightweight ERC20, Ownable, oracle, and router interfaces so the contract is self-contained.

## Configuration Notes

- **Collateral Token** – Pass the deployed meme token address into the constructor. The token must implement `IERC20Metadata`.
- **Price Feed** – Provide an oracle that returns meme token price in USD terms. Defaults align with Chainlink AggregatorV3.
- **DEX Router** – Supply an address that supports `swapTokensForExactTokens`, such as a Uniswap V2 compatible router.

## Basic Workflow

1. **Deposit Collateral** – Call `depositCollateral(amount)` after approving the contract to transfer the meme token.
2. **Mint Stablecoin** – Call `mintStablecoin(amount)` to mint up to 10% of the USD value of locked collateral.
3. **Withdraw Collateral** – Use `withdrawCollateral(amount)` if the position stays above the required ratio.
4. **Repay & Exit** – Call `repayAndClose()` after burning all outstanding debt to recover collateral minus the 5% burn.
5. **Rebalance** – Keeper bots monitor positions and call `rebalancePosition` to enforce the 300% liquidation ratio.

## TODOs

- Replace mock infrastructure with production-grade contracts (meme token, oracle, router) as you move beyond testing.
- Implement keeper or cron jobs that monitor positions and call `rebalancePosition` when needed.
- Assess and integrate economic parameters such as ongoing stability fees, governance-controlled burn rates, or variable liquidation sizes.
- Build monitoring/alerting (ratio dashboards, oracle freshness) and document emergency procedures before staging/mainnet rollout.

This implementation is a starting point and should be carefully audited and adapted before mainnet deployment.

## Local Hardhat Deployment

- Install dependencies: `npm install`
- Start a local node: `npm run node`
- In a separate terminal deploy mocks and the CDP contract: `npm run deploy:localhost`
- Review the console output for deployed addresses and example position data. You can attach a Hardhat console with `npx hardhat console --network localhost` to interact further.

## Sepolia Deployment

- Populate `.env` with:
	- `SEPOLIA_RPC_URL` pointing to an RPC endpoint (e.g., Alchemy, Infura).
	- `SEPOLIA_PRIVATE_KEY` for the deployer wallet (fund it with Sepolia ETH via faucet).
	- `SEPOLIA_COLLATERAL` set to the deployed meme-token contract address.
	- `SEPOLIA_PRICE_FEED` pointing to a Chainlink aggregator (or a managed feed for your meme token).
	- `SEPOLIA_ROUTER` set to a Uniswap/Sushiswap-style router that supports `swapTokensForExactTokens`.
	- Optional: `SEPOLIA_OWNER` to transfer governance on deployment; defaults to the deployer.
- Deploy the stablecoin with `npm run deploy:sepolia`.
- After deployment, seed the router with collateral/stablecoin liquidity and keep the price feed updated so the CDP health checks and liquidation flow operate correctly.
