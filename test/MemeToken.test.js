const { expect } = require("chai");
const { ethers } = require("hardhat");

async function deployFixture() {
  const [admin, treasury, user] = await ethers.getSigners();
  const initialSupply = ethers.parseUnits("1000000", 18);
  const MemeToken = await ethers.getContractFactory("MemeToken");
  const token = await MemeToken.deploy(admin.address, initialSupply);
  await token.waitForDeployment();

  await token.grantRole(await token.TREASURY_ROLE(), treasury.address);

  return { token, admin, treasury, user, initialSupply };
}

describe("MemeToken", function () {
  it("assigns initial supply to the admin", async function () {
    const { token, admin, initialSupply } = await deployFixture();
    const balance = await token.balanceOf(admin.address);
    expect(balance).to.equal(initialSupply);
  });

  it("allows addresses with treasury role to mint", async function () {
    const { token, treasury, user } = await deployFixture();
    const mintAmount = ethers.parseUnits("500", 18);

    await expect(token.connect(treasury).mint(user.address, mintAmount))
      .to.emit(token, "Transfer")
      .withArgs(ethers.ZeroAddress, user.address, mintAmount);

    const userBalance = await token.balanceOf(user.address);
    expect(userBalance).to.equal(mintAmount);
  });

  it("reverts mint attempts from non-treasury addresses", async function () {
    const { token, user } = await deployFixture();
    const mintAmount = ethers.parseUnits("1", 18);

    await expect(token.connect(user).mint(user.address, mintAmount))
      .to.be.revertedWithCustomError(token, "AccessControlUnauthorizedAccount")
      .withArgs(user.address, await token.TREASURY_ROLE());
  });

  it("allows token holders to burn their balance", async function () {
    const { token, admin } = await deployFixture();
    const burnAmount = ethers.parseUnits("100", 18);

    await expect(token.connect(admin).burn(burnAmount))
      .to.emit(token, "Transfer")
      .withArgs(admin.address, ethers.ZeroAddress, burnAmount);

    const balance = await token.balanceOf(admin.address);
    expect(balance).to.equal(ethers.parseUnits("999900", 18));
  });
});
