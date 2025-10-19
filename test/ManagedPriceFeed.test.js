const { expect } = require("chai");
const { ethers } = require("hardhat");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");

async function deployFixture() {
  const [admin, updater, outsider] = await ethers.getSigners();
  const ManagedPriceFeed = await ethers.getContractFactory("ManagedPriceFeed");
  const feed = await ManagedPriceFeed.deploy(admin.address, 8, "MEME / USD");
  await feed.waitForDeployment();
  await feed.grantRole(await feed.UPDATER_ROLE(), updater.address);
  return { feed, admin, updater, outsider };
}

describe("ManagedPriceFeed", function () {
  it("stores the configured metadata", async function () {
    const { feed } = await deployFixture();
    expect(await feed.decimals()).to.equal(8);
    expect(await feed.description()).to.equal("MEME / USD");
    expect(await feed.version()).to.equal(1);
  });

  it("reverts latestRoundData before any update", async function () {
    const { feed } = await deployFixture();
    await expect(feed.latestRoundData()).to.be.revertedWith("NoData");
  });

  it("allows updater role to push price data", async function () {
    const { feed, updater } = await deployFixture();
    const price = ethers.parseUnits("1", 8);

    await expect(feed.connect(updater).pushPrice(price))
      .to.emit(feed, "PriceUpdated")
      .withArgs(1, price, anyValue);

    const [, answer] = await feed.latestRoundData();
    expect(answer).to.equal(price);
  });

  it("increments round IDs on successive updates", async function () {
    const { feed, updater } = await deployFixture();
    const price1 = ethers.parseUnits("1", 8);
    const price2 = ethers.parseUnits("1.1", 8);

    await feed.connect(updater).pushPrice(price1);
    await feed.connect(updater).pushPrice(price2);

    const [roundId, answer] = await feed.latestRoundData();
    expect(roundId).to.equal(2n);
    expect(answer).to.equal(price2);
  });

  it("blocks updates from accounts without updater role", async function () {
    const { feed, outsider } = await deployFixture();
    const price = ethers.parseUnits("1", 8);

    await expect(feed.connect(outsider).pushPrice(price))
      .to.be.revertedWithCustomError(feed, "AccessControlUnauthorizedAccount")
      .withArgs(outsider.address, await feed.UPDATER_ROLE());
  });
});
