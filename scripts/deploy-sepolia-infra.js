const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying infrastructure with ${deployer.address}`);

  const initialSupply = ethers.parseUnits("100000000", 18);
  const Collateral = await ethers.getContractFactory("MockCollateralToken");
  const collateral = await Collateral.deploy("Sepolia Meme", "sMEME", 18, initialSupply);
  await collateral.waitForDeployment();
  console.log(`Collateral token deployed at ${collateral.target}`);

  const Aggregator = await ethers.getContractFactory("MockAggregator");
  const price = ethers.parseUnits("1", 8);
  const aggregator = await Aggregator.deploy(8, price);
  await aggregator.waitForDeployment();
  console.log(`Price feed deployed at ${aggregator.target}`);

  const Router = await ethers.getContractFactory("MockRouter");
  const router = await Router.deploy();
  await router.waitForDeployment();
  console.log(`Router deployed at ${router.target}`);

  console.log("Remember to fund the router with stablecoins when testing liquidation rebalances.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
