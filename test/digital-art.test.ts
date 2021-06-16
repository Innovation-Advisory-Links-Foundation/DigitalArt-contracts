import { Signer } from "@ethersproject/abstract-signer"
import { Contract, ContractFactory } from "@ethersproject/contracts"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { ethers } from "hardhat"

// Digital Art Smart Contract unit tests.
describe("*** DigitalArt ***", () => {
  let DigitalArt: ContractFactory // Contract factory for istantiating new DigitalArt smart contract istances.
  let digitalArtIstance: Contract // DigitalArt smart contract istance.
  let signers: Array<SignerWithAddress> // Users accounts.
  let artist: SignerWithAddress
  let collector: SignerWithAddress

  before(async () => {
    // Get contract factory.
    DigitalArt = await ethers.getContractFactory("DigitalArt")
    // Create a new istance.
    digitalArtIstance = await DigitalArt.deploy()
    await digitalArtIstance.deployed()

    // Get users (signers) accounts.
    signers = await ethers.getSigners()
    artist = signers[0]
    collector = signers[1]
  })

  describe("# NFT Minting", () => {
    // NFT info.
    const expectedTokenId = 1
    const tokenURI = "ipfs://test/metadata.json"
    const sellingPrice = 1000000
    const dailyLicensePrice = 1000000

    it("Should be not possible to mint a token with an invalid selling price", async () => {
      // Send tx.
      const tx = digitalArtIstance
        .connect(artist)
        .safeMint(tokenURI, 0, dailyLicensePrice)

      await expect(tx).to.be.reverted
    })

    it("Should be not possible to mint a token with an invalid daily license price", async () => {
      // Send tx.
      const tx = digitalArtIstance
        .connect(artist)
        .safeMint(tokenURI, sellingPrice, 0)

      await expect(tx).to.be.reverted
    })

    it("Should mint a new NFT", async () => {
      // Send tx.
      const tx = await digitalArtIstance
        .connect(artist)
        .safeMint(tokenURI, sellingPrice, dailyLicensePrice)

      // Wait until the tx is mined to get back the events.
      const { events } = await tx.wait()
      const { from, to, tokenId } = events[0].args

      // Event checks.
      expect(Number(from)).to.be.equal(0)
      expect(to).to.be.equal(artist.address)
      expect(Number(tokenId.toString())).to.be.equal(expectedTokenId)

      // Storage checks.
      const nft = await digitalArtIstance.idToNFT(expectedTokenId)
      expect(nft.id).to.be.equal(expectedTokenId)
      expect(nft.sellingPrice).to.be.equal(sellingPrice)
      expect(nft.dailyLicensePrice).to.be.equal(dailyLicensePrice)
      expect(nft.uri).to.be.equal(tokenURI)
      expect(nft.artist).to.be.equal(artist.address)
      expect(nft.owner).to.be.equal(artist.address)

      // Methods checks.
      expect(await digitalArtIstance.balanceOf(artist.address)).to.be.equal(
        expectedTokenId
      )
      expect(await digitalArtIstance.ownerOf(expectedTokenId)).to.be.equal(
        artist.address
      )
      expect(
        await digitalArtIstance.getAllTokenIds(artist.address)
      ).to.be.deep.equal([tokenId])
      expect(await digitalArtIstance.tokenURI(tokenId)).to.be.equal(tokenURI)
    })

    it("Should be not possible to mint a token with the same IPFS CID twice", async () => {
      // Send tx.
      const tx = digitalArtIstance
        .connect(artist)
        .safeMint(tokenURI, sellingPrice, dailyLicensePrice)

      await expect(tx).to.be.reverted
    })
  })
})
