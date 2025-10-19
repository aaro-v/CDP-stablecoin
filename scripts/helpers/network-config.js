function loadNetworkConfig(networkName) {
  const upper = networkName.toUpperCase();
  const collateral = process.env[`${upper}_COLLATERAL`];
  const priceFeed = process.env[`${upper}_PRICE_FEED`];
  const router = process.env[`${upper}_ROUTER`];
  const owner = process.env[`${upper}_OWNER`];

  if (!collateral) {
    throw new Error(`Missing environment variable ${upper}_COLLATERAL`);
  }
  if (!priceFeed) {
    throw new Error(`Missing environment variable ${upper}_PRICE_FEED`);
  }
  if (!router) {
    throw new Error(`Missing environment variable ${upper}_ROUTER`);
  }

  return {
    collateral,
    priceFeed,
    router,
    owner
  };
}

module.exports = {
  loadNetworkConfig
};
