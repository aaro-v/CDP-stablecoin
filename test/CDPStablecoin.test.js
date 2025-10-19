const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

const MEME_DECIMALS = 18;
const USD_DECIMALS = 18;

async function deployFixture() {
  const [owner, user, keeper] = await ethers.getSigners();

  const initialSupply = ethers.parseUnits("1000000", MEME_DECIMALS);
  const Collateral = await ethers.getContractFactory("MockCollateralToken");
  const collateral = await Collateral.deploy("Meme Token", "MEME", MEME_DECIMALS, initialSupply);
  await collateral.waitForDeployment();

  const Aggregator = await ethers.getContractFactory("MockAggregator");
  const price = ethers.parseUnits("1", 8);
  const aggregator = await Aggregator.deploy(8, price);
  await aggregator.waitForDeployment();

  const Router = await ethers.getContractFactory("MockRouter");
  const router = await Router.deploy();
  await router.waitForDeployment();

  const Stablecoin = await ethers.getContractFactory("CDPStablecoin");
  const stablecoin = await Stablecoin.deploy(
    owner.address,
    await collateral.getAddress(),
    await aggregator.getAddress(),
    await router.getAddress()
  );
  await stablecoin.waitForDeployment();

  // Fund the user with collateral for testing flows
  const userCollateral = ethers.parseUnits("50000", MEME_DECIMALS);
  await collateral.mint(user.address, userCollateral);

  return { owner, user, keeper, collateral, aggregator, router, stablecoin };
}

describe("CDPStablecoin", function () {
  describe("Mint limits", function () {
    it("enforces the 10:1 collateralisation requirement", async function () {
      const { user, collateral, stablecoin } = await loadFixture(deployFixture);

      const stablecoinAddress = await stablecoin.getAddress();
      const depositAmount = ethers.parseUnits("10000", MEME_DECIMALS);
      await collateral.connect(user).approve(stablecoinAddress, depositAmount);
      await expect(stablecoin.connect(user).depositCollateral(depositAmount))
        .to.emit(stablecoin, "CollateralDeposited")
        .withArgs(user.address, depositAmount);

      const maxMint = ethers.parseUnits("1000", USD_DECIMALS);
      await expect(stablecoin.connect(user).mintStablecoin(maxMint))
        .to.emit(stablecoin, "StablecoinMinted")
        .withArgs(user.address, maxMint);

      const extraMint = ethers.parseUnits("1", USD_DECIMALS);
      await expect(stablecoin.connect(user).mintStablecoin(extraMint)).to.be.revertedWith("InsufficientCollateral");
    });
  });

  describe("Collateral withdrawals", function () {
    it("allows healthy withdrawals and blocks unhealthy ones", async function () {
      const { user, collateral, stablecoin } = await loadFixture(deployFixture);

      const stablecoinAddress = await stablecoin.getAddress();
      const depositAmount = ethers.parseUnits("10000", MEME_DECIMALS);
      await collateral.connect(user).approve(stablecoinAddress, depositAmount);
      await stablecoin.connect(user).depositCollateral(depositAmount);

      const mintAmount = ethers.parseUnits("500", USD_DECIMALS);
      await stablecoin.connect(user).mintStablecoin(mintAmount);

      const healthyWithdrawal = ethers.parseUnits("1000", MEME_DECIMALS);
      await expect(stablecoin.connect(user).withdrawCollateral(healthyWithdrawal))
        .to.emit(stablecoin, "CollateralWithdrawn")
        .withArgs(user.address, healthyWithdrawal);

      const unhealthyWithdrawal = ethers.parseUnits("9000", MEME_DECIMALS);
      await expect(stablecoin.connect(user).withdrawCollateral(unhealthyWithdrawal)).to.be.revertedWith("Underwater");
    });
  });

  describe("Fee accounting", function () {
    it("burns 5% of collateral when closing a fully repaid position", async function () {
      const { user, collateral, stablecoin } = await loadFixture(deployFixture);

      const stablecoinAddress = await stablecoin.getAddress();
      const depositAmount = ethers.parseUnits("10000", MEME_DECIMALS);
      const startingCollateral = await collateral.balanceOf(user.address);
      await collateral.connect(user).approve(stablecoinAddress, depositAmount);
      await stablecoin.connect(user).depositCollateral(depositAmount);

      const mintAmount = ethers.parseUnits("500", USD_DECIMALS);
      await stablecoin.connect(user).mintStablecoin(mintAmount);

      await expect(stablecoin.connect(user).repayAndClose())
        .to.emit(stablecoin, "PositionClosed")
        .withArgs(user.address, ethers.parseUnits("9500", MEME_DECIMALS), ethers.parseUnits("500", MEME_DECIMALS));

  const userCollateralBalance = await collateral.balanceOf(user.address);
  const expectedCollateral = startingCollateral - depositAmount + ethers.parseUnits("9500", MEME_DECIMALS);
  expect(userCollateralBalance).to.equal(expectedCollateral);

      const position = await stablecoin.getPosition(user.address);
      expect(position[0]).to.equal(0n);
      expect(position[1]).to.equal(0n);

      const userStableBalance = await stablecoin.balanceOf(user.address);
      expect(userStableBalance).to.equal(0n);
    });
  });

  describe("Liquidation path", function () {
    it("reduces debt by 2 cUSD when a position is liquidated", async function () {
      const { owner, user, collateral, stablecoin, aggregator, router } = await loadFixture(deployFixture);

      const stablecoinAddress = await stablecoin.getAddress();
      const collateralAddress = await collateral.getAddress();
      const routerAddress = await router.getAddress();

      const depositAmount = ethers.parseUnits("1000", MEME_DECIMALS);
      await collateral.connect(user).approve(stablecoinAddress, depositAmount);
      await stablecoin.connect(user).depositCollateral(depositAmount);

      const mintAmount = ethers.parseUnits("100", USD_DECIMALS);
      await stablecoin.connect(user).mintStablecoin(mintAmount);

      // Prefund the router with stablecoins so it can pay out the swap
      await stablecoin.connect(user).transfer(routerAddress, ethers.parseUnits("10", USD_DECIMALS));

      // Drop the price so the position falls below the 300% liquidation ratio
      const distressedPrice = ethers.parseUnits("0.2", 8);
      await aggregator.updateAnswer(distressedPrice);

      const path = [collateralAddress, stablecoinAddress];
      const amountInMax = ethers.parseUnits("10", MEME_DECIMALS);
      await expect(stablecoin.connect(owner).rebalancePosition(user.address, amountInMax, 0, path))
        .to.emit(stablecoin, "PositionRebalanced")
        .withArgs(user.address, amountInMax, ethers.parseUnits("2", USD_DECIMALS));

      const position = await stablecoin.getPosition(user.address);
      expect(position[0]).to.equal(depositAmount - amountInMax);
      expect(position[1]).to.equal(mintAmount - ethers.parseUnits("2", USD_DECIMALS));

      const contractStableBalance = await stablecoin.balanceOf(stablecoinAddress);
      expect(contractStableBalance).to.equal(0n);
    });
  });
});
