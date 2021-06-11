import { Contract, ContractFactory } from "@ethersproject/contracts"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers } from "hardhat"

describe("Dummy DigitalArt Test", () => {
  it("Should mint a new NFT", async () => {
    // DigitalArt contract deploy.
    const DigitalArt: ContractFactory = await ethers.getContractFactory(
      "DigitalArt"
    )
    const digitalArtIstance: Contract = await DigitalArt.deploy()
    await digitalArtIstance.deployed()

    // Get tx signer and NFT receiver (owner).
    const [signer, receiver]: Array<SignerWithAddress> =
      await ethers.getSigners()

    // Send tx.
    await digitalArtIstance
      .connect(signer)
      .safeMint(receiver.address, "dummyTokenURI")

    // Checks.
    expect(
      await digitalArtIstance.connect(signer).balanceOf(receiver.address)
    ).to.be.equal(1)
    expect(await digitalArtIstance.connect(signer).ownerOf(1)).to.be.equal(
      receiver.address
    )
  })
})
