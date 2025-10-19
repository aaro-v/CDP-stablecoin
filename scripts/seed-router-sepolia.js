const { ethers, network } = require("hardhat");

const COLLATERAL_DECIMALS = 18;
const STABLE_DECIMALS = 18;
const PRICE_DECIMALS = 8;

async function main() {
  const upper = network.name.toUpperCase();
  const stablecoinAddress = process.env[`${upper}_STABLECOIN`];
  const collateralAddress = process.env[`${upper}_COLLATERAL`];
  const routerAddress = process.env[`${upper}_ROUTER`];
  const priceFeedAddress = process.env[`${upper}_PRICE_FEED`];

  if (!stablecoinAddress) throw new Error(`Missing ${upper}_STABLECOIN in environment`);
  if (!collateralAddress) throw new Error(`Missing ${upper}_COLLATERAL in environment`);
  if (!routerAddress) throw new Error(`Missing ${upper}_ROUTER in environment`);
  if (!priceFeedAddress) throw new Error(`Missing ${upper}_PRICE_FEED in environment`);

  const [deployer] = await ethers.getSigners();
  console.log(`Seeding router liquidity on ${network.name}`);
  console.log(`  Deployer: ${deployer.address}`);

  const stablecoin = await ethers.getContractAt("CDPStablecoin", stablecoinAddress);
  const collateral = await ethers.getContractAt("MockCollateralToken", collateralAddress);
  const priceFeed = await ethers.getContractAt("MockAggregator", priceFeedAddress);

  const depositAmount = ethers.parseUnits("10000", COLLATERAL_DECIMALS);
  const mintAmount = ethers.parseUnits("1000", STABLE_DECIMALS);
  const routerStableSeed = ethers.parseUnits("500", STABLE_DECIMALS);
  const routerCollateralSeed = ethers.parseUnits("1000", COLLATERAL_DECIMALS);
  const updatedPrice = ethers.parseUnits("1.05", PRICE_DECIMALS);

  const collateralBalance = await collateral.balanceOf(deployer.address);
  if (collateralBalance < depositAmount + routerCollateralSeed) {
    throw new Error("Not enough collateral tokens to seed router and deposit collateral");
  }

  console.log(`  Approving ${ethers.formatUnits(depositAmount, COLLATERAL_DECIMALS)} MEME to CDP contract`);
  await (await collateral.approve(stablecoinAddress, depositAmount)).wait();

  console.log("  Depositing collateral");
  await (await stablecoin.depositCollateral(depositAmount)).wait();

  console.log(`  Minting ${ethers.formatUnits(mintAmount, STABLE_DECIMALS)} cUSD`);
  await (await stablecoin.mintStablecoin(mintAmount)).wait();

  console.log(`  Transferring ${ethers.formatUnits(routerStableSeed, STABLE_DECIMALS)} cUSD to router`);
  await (await stablecoin.transfer(routerAddress, routerStableSeed)).wait();

  console.log(`  Transferring ${ethers.formatUnits(routerCollateralSeed, COLLATERAL_DECIMALS)} MEME to router`);
  await (await collateral.transfer(routerAddress, routerCollateralSeed)).wait();

  console.log("  Updating price feed to reflect new market price (1.05 USD)");
  await (await priceFeed.updateAnswer(updatedPrice)).wait();

  const routerStableBalance = await stablecoin.balanceOf(routerAddress);
  const routerCollateralBalance = await collateral.balanceOf(routerAddress);
  const position = await stablecoin.getPosition(deployer.address);
  const ratio = await stablecoin.collateralRatio(deployer.address);

  console.log("Liquidity seeded:");
  console.log(`  Router stable balance: ${ethers.formatUnits(routerStableBalance, STABLE_DECIMALS)} cUSD`);
  console.log(`  Router collateral balance: ${ethers.formatUnits(routerCollateralBalance, COLLATERAL_DECIMALS)} MEME`);
  console.log(`  Deployer position collateral: ${ethers.formatUnits(position[0], COLLATERAL_DECIMALS)} MEME`);
  console.log(`  Deployer position debt: ${ethers.formatUnits(position[1], STABLE_DECIMALS)} cUSD`);
  console.log(`  Collateral ratio: ${(Number(ratio) / 100).toFixed(2)}%`);

  console.log("Router ready for liquidation simulations.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
