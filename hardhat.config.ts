require("dotenv").config()
import { config } from "./package.json"
import { HardhatUserConfig } from "hardhat/config"

import "@nomiclabs/hardhat-waffle"
import "@nomiclabs/hardhat-ethers"

// https://hardhat.org/config/
const hardhatConfig: HardhatUserConfig = {
    solidity: config.solidity,
    paths: {
        sources: config.paths.contracts,
        tests: config.paths.tests,
        cache: config.paths.cache,
        artifacts: config.paths.build.contracts
    },
    defaultNetwork: "local",
    networks: {
        local: {
            url: "http://127.0.0.1:8545",
            gasPrice: 300000
        },
        ropsten: {
            url: `https://ropsten.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            accounts: [`0x${process.env.MARKETPLACE_OWNER_PRIVATE_KEY}`],
        }
    }
}

export default hardhatConfig
