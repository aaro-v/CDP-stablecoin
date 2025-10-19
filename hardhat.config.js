require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

const {
  RPC_URL,
  PRIVATE_KEY,
  SEPOLIA_RPC_URL,
  SEPOLIA_PRIVATE_KEY,
  ETHERSCAN_API_KEY
} = process.env;

const networks = {
  hardhat: {
    chainId: 31337
  },
  localhost: {
    url: "http://127.0.0.1:8545"
  }
};

if (RPC_URL) {
  networks.custom = {
    url: RPC_URL,
    accounts: PRIVATE_KEY ? [PRIVATE_KEY] : undefined
  };
}

if (SEPOLIA_RPC_URL) {
  networks.sepolia = {
    url: SEPOLIA_RPC_URL,
    chainId: 11155111,
    accounts: SEPOLIA_PRIVATE_KEY ? [SEPOLIA_PRIVATE_KEY] : undefined
  };
}

/** @type import("hardhat/config").HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  defaultNetwork: "hardhat",
  networks,
  etherscan: {
    apiKey: ETHERSCAN_API_KEY || "",
    customChains: [
      {
        network: "sepolia",
        chainId: 11155111,
        urls: {
          apiURL: "https://api-sepolia.etherscan.io/api",
          browserURL: "https://sepolia.etherscan.io"
        }
      }
    ]
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  }
};
