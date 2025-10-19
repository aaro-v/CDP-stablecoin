const { ethers, network } = require("hardhat");
const { loadNetworkConfig } = require("./helpers/network-config");

async function main() {
  const { collateral, priceFeed, router, owner } = loadNetworkConfig(network.name);

  const [deployer] = await ethers.getSigners();
  const ownerAddress = owner || deployer.address;

  console.log(`Deploying CDPStablecoin to ${network.name}`);
  console.log(`  Deployer: ${deployer.address}`);
  console.log(`  Owner: ${ownerAddress}`);
  console.log(`  Collateral token: ${collateral}`);
  console.log(`  Price feed: ${priceFeed}`);
  console.log(`  Router: ${router}`);

  const Stablecoin = await ethers.getContractFactory("CDPStablecoin");
  const stablecoin = await Stablecoin.deploy(ownerAddress, collateral, priceFeed, router);
  await stablecoin.waitForDeployment();

  console.log(`CDPStablecoin deployed at ${stablecoin.target}`);

  const ratio = await stablecoin.MIN_COLLATERAL_RATIO();
  console.log(`Minimum collateral ratio: ${Number(ratio) / 100}%`);

  console.log("Deployment complete. Remember to verify the contract and seed router liquidity for rebalancing operations.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
