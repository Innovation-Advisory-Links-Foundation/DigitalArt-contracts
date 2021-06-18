import hre from "hardhat"

async function main() {
  // We get the contract to deploy.
  const DigitalArt = await hre.ethers.getContractFactory("DigitalArt")
  const digitalArtIstance = await DigitalArt.deploy()

  await digitalArtIstance.deployed()

  console.log(
    "DigitalArt smart contract is deployed to:",
    digitalArtIstance.address
  )
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
