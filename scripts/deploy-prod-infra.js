const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log(`Deploying production infrastructure from ${deployer.address}`);

  const initialSupply = ethers.parseUnits("100000000", 18);
  const MemeToken = await ethers.getContractFactory("MemeToken");
  const memeToken = await MemeToken.deploy(deployer.address, initialSupply);
  await memeToken.waitForDeployment();
  console.log(`MemeToken deployed at ${memeToken.target}`);

  const ManagedPriceFeed = await ethers.getContractFactory("ManagedPriceFeed");
  const priceFeed = await ManagedPriceFeed.deploy(
    deployer.address,
    8,
    "MEME / USD"
  );
  await priceFeed.waitForDeployment();
  const initialPrice = ethers.parseUnits("1", 8);
  await (await priceFeed.pushPrice(initialPrice)).wait();
  console.log(`ManagedPriceFeed deployed at ${priceFeed.target}`);

  const factoryArtifact = require("@uniswap/v2-core/build/UniswapV2Factory.json");
  const UniswapV2Factory = new ethers.ContractFactory(
    factoryArtifact.abi,
    factoryArtifact.bytecode,
    deployer
  );
  const factory = await UniswapV2Factory.deploy(deployer.address);
  await factory.waitForDeployment();
  console.log(`UniswapV2Factory deployed at ${factory.target}`);

  const wethArtifact = require("@uniswap/v2-periphery/build/WETH9.json");
  const WETH9 = new ethers.ContractFactory(wethArtifact.abi, wethArtifact.bytecode, deployer);
  const weth = await WETH9.deploy();
  await weth.waitForDeployment();
  console.log(`WETH9 deployed at ${weth.target}`);

  const routerArtifact = require("@uniswap/v2-periphery/build/UniswapV2Router02.json");
  const UniswapV2Router02 = new ethers.ContractFactory(
    routerArtifact.abi,
    routerArtifact.bytecode,
    deployer
  );
  const router = await UniswapV2Router02.deploy(factory.target, weth.target);
  await router.waitForDeployment();
  console.log(`UniswapV2Router02 deployed at ${router.target}`);

  console.log("Infrastructure deployment complete. Update your .env with these addresses before deploying the CDPStablecoin.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
