const { ethers, network } = require("hardhat");
const routerArtifact = require("@uniswap/v2-periphery/build/UniswapV2Router02.json");
const factoryArtifact = require("@uniswap/v2-core/build/UniswapV2Factory.json");
const pairArtifact = require("@uniswap/v2-core/build/UniswapV2Pair.json");

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
  const collateral = await ethers.getContractAt("MemeToken", collateralAddress);
  const priceFeed = await ethers.getContractAt("ManagedPriceFeed", priceFeedAddress);
  const router = new ethers.Contract(routerAddress, routerArtifact.abi, deployer);

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

  console.log("  Approving router for collateral and stablecoin contributions");
  await (await collateral.approve(routerAddress, routerCollateralSeed)).wait();
  await (await stablecoin.approve(routerAddress, routerStableSeed)).wait();

  const deadline = Math.floor(Date.now() / 1000) + 60 * 10;
  console.log("  Adding liquidity to MEME/cUSD pool");
  await (
    await router.addLiquidity(
      collateralAddress,
      stablecoinAddress,
      routerCollateralSeed,
      routerStableSeed,
      0,
      0,
      deployer.address,
      deadline
    )
  ).wait();

  console.log("  Updating price feed to reflect new market price (1.05 USD)");
  await (await priceFeed.pushPrice(updatedPrice)).wait();

  const factoryAddress = await router.factory();
  const factory = new ethers.Contract(factoryAddress, factoryArtifact.abi, deployer);
  const pairAddress = await factory.getPair(collateralAddress, stablecoinAddress);
  const pair = new ethers.Contract(pairAddress, pairArtifact.abi, deployer);
  const reserves = await pair.getReserves();
  const token0 = await pair.token0();
  const [reserve0, reserve1] = reserves;
  const memeReserve = token0.toLowerCase() === collateralAddress.toLowerCase() ? reserve0 : reserve1;
  const stableReserve = token0.toLowerCase() === collateralAddress.toLowerCase() ? reserve1 : reserve0;
  const position = await stablecoin.getPosition(deployer.address);
  const ratio = await stablecoin.collateralRatio(deployer.address);

  console.log("Liquidity seeded:");
  console.log(
    `  Pool reserves: ${ethers.formatUnits(memeReserve, COLLATERAL_DECIMALS)} MEME / ${ethers.formatUnits(
      stableReserve,
      STABLE_DECIMALS
    )} cUSD`
  );
  console.log(`  Deployer position collateral: ${ethers.formatUnits(position[0], COLLATERAL_DECIMALS)} MEME`);
  console.log(`  Deployer position debt: ${ethers.formatUnits(position[1], STABLE_DECIMALS)} cUSD`);
  console.log(`  Collateral ratio: ${(Number(ratio) / 100).toFixed(2)}%`);

  console.log("Router ready for liquidation simulations.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
