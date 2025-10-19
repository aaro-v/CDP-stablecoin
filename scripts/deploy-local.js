const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deployer: ${deployer.address}`);

  const initialSupply = ethers.parseUnits("100000000", 18);
  const Collateral = await ethers.getContractFactory("MockCollateralToken");
  const collateral = await Collateral.deploy("Meme Token", "MEME", 18, initialSupply);
  await collateral.waitForDeployment();
  console.log(`MockCollateralToken deployed at ${collateral.target}`);

  const Aggregator = await ethers.getContractFactory("MockAggregator");
  const price = ethers.parseUnits("1", 8); // $1 per MEME with 8 decimals
  const aggregator = await Aggregator.deploy(8, price);
  await aggregator.waitForDeployment();
  console.log(`MockAggregator deployed at ${aggregator.target}`);

  const Router = await ethers.getContractFactory("MockRouter");
  const router = await Router.deploy();
  await router.waitForDeployment();
  console.log(`MockRouter deployed at ${router.target}`);

  const Stablecoin = await ethers.getContractFactory("CDPStablecoin");
  const stablecoin = await Stablecoin.deploy(
    deployer.address,
    collateral.target,
    aggregator.target,
    router.target
  );
  await stablecoin.waitForDeployment();
  console.log(`CDPStablecoin deployed at ${stablecoin.target}`);

  // Example workflow: deposit collateral and mint stablecoin
  const depositAmount = ethers.parseUnits("10000", 18);
  const mintAmount = ethers.parseUnits("500", 18); // maintains 1000% ratio at $1 price

  const approveTx = await collateral.approve(stablecoin.target, depositAmount);
  await approveTx.wait();
  console.log(`Approved ${ethers.formatUnits(depositAmount, 18)} MEME for collateral.`);

  const depositTx = await stablecoin.depositCollateral(depositAmount);
  await depositTx.wait();
  console.log(`Deposited collateral.`);

  const mintTx = await stablecoin.mintStablecoin(mintAmount);
  await mintTx.wait();
  console.log(`Minted ${ethers.formatUnits(mintAmount, 18)} cUSD.`);

  const position = await stablecoin.getPosition(deployer.address);
  console.log(`Position collateral: ${ethers.formatUnits(position[0], 18)} MEME`);
  console.log(`Position debt: ${ethers.formatUnits(position[1], 18)} cUSD`);

  const ratio = await stablecoin.collateralRatio(deployer.address);
  console.log(`Collateral ratio: ${(Number(ratio) / 100).toFixed(2)}%`);

  console.log("Deployment complete. You can now interact with the contract using Hardhat console or scripts.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
