const { ethers, network } = require("hardhat");

function getEnvOrThrow(key) {
  const value = process.env[key];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable ${key}`);
  }
  return value.trim();
}

async function main() {
  const upper = network.name.toUpperCase();
  const stablecoinAddress = getEnvOrThrow(`${upper}_STABLECOIN`);
  const collateralAddress = getEnvOrThrow(`${upper}_COLLATERAL`);
  const monitored = getEnvOrThrow(`${upper}_MONITORED_ACCOUNTS`)
    .split(",")
    .map((addr) => addr.trim())
    .filter(Boolean);

  if (monitored.length === 0) {
    throw new Error(`No accounts specified in ${upper}_MONITORED_ACCOUNTS`);
  }

  const collateralMaxRaw = process.env[`${upper}_REBALANCE_COLLATERAL_MAX`] || "1000";
  const thresholdBps = BigInt(process.env[`${upper}_LIQ_THRESHOLD_BPS`] || "30000");

  const [keeper] = await ethers.getSigners();

  const stablecoin = await ethers.getContractAt("CDPStablecoin", stablecoinAddress, keeper);

  const collateralDecimals = await stablecoin.collateralDecimals();
  const stableDecimals = await stablecoin.decimals();
  const repayAmount = await stablecoin.LIQUIDATION_REPAY_AMOUNT();

  const amountInMax = ethers.parseUnits(collateralMaxRaw, collateralDecimals);
  const amountOutMin = 0n;

  console.log(`Keeper monitor running on ${network.name}`);
  console.log(`  Keeper address: ${keeper.address}`);
  console.log(`  Watching ${monitored.length} account(s)`);
  console.log(`  Threshold: ${(Number(thresholdBps) / 100).toFixed(2)}%`);
  console.log(`  Max collateral swap: ${ethers.formatUnits(amountInMax, collateralDecimals)} tokens`);
  console.log(`  Repay amount per liquidation: ${ethers.formatUnits(repayAmount, stableDecimals)} cUSD`);

  const path = [collateralAddress, stablecoinAddress];

  for (const account of monitored) {
    const position = await stablecoin.getPosition(account);
    const collateralAmount = position[0];
    const debtAmount = position[1];

    if (debtAmount === 0n) {
      console.log(`- ${account} has no debt, skipping`);
      continue;
    }

    const ratio = await stablecoin.collateralRatio(account);
    console.log(
      `- ${account} collateral ratio ${(Number(ratio) / 100).toFixed(2)}% (collateral: ${ethers.formatUnits(
        collateralAmount,
        collateralDecimals
      )}, debt: ${ethers.formatUnits(debtAmount, stableDecimals)})`
    );

    if (ratio < thresholdBps) {
      console.log(`  -> Ratio below threshold, calling rebalancePosition`);
      const tx = await stablecoin.rebalancePosition(account, amountInMax, amountOutMin, path);
      const receipt = await tx.wait();
      console.log(`  -> Rebalance tx hash: ${receipt.hash}`);
    }
  }

  console.log("Keeper monitor run complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
