import { Signer } from "@ethersproject/abstract-signer"
import { Contract, ContractFactory } from "@ethersproject/contracts"
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers"
import { expect } from "chai"
import { BigNumber } from "ethers"
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
    const sellingPrice = ethers.utils.parseEther("0.0001")
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
        await digitalArtIstance.getNumberOfTokensForOwner(artist.address)
      ).to.be.equal(tokenId)
      expect(
        await digitalArtIstance.getIdFromIndexForOwner(artist.address, 0)
      ).to.be.equal(tokenId)
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

  describe("# NFT Purchase", () => {
    const tokenId = 1
    const price = ethers.utils.parseEther("0.0001")

    it("Should be not possible to purchase a non minted token", async () => {
      // Send tx.
      const tx = digitalArtIstance.connect(artist).purchaseNFT(1000)

      await expect(tx).to.be.reverted
    })

    it("Should be not possible to purchase a NFT if the sender is the owner", async () => {
      // Send tx.
      const tx = digitalArtIstance.connect(artist).purchaseNFT(tokenId)

      await expect(tx).to.be.reverted
    })

    it("Should be not possible to purchase a NFT if the sender sends an amount lower than the NFT price", async () => {
      // Send tx.
      const tx = digitalArtIstance.connect(artist).purchaseNFT(tokenId)

      await expect(tx).to.be.reverted
    })

    it("Should be possible to purchase a NFT", async () => {
      // Get balances before sending the tx.
      const artistBalanceBefore = ethers.utils.formatEther(
        await ethers.provider.getBalance(artist.address)
      )
      const collectorBalanceBefore = ethers.utils.formatEther(
        await ethers.provider.getBalance(collector.address)
      )

      // Send tx.
      const tx = await digitalArtIstance
        .connect(collector)
        .purchaseNFT(tokenId, { value: price })

      // Wait until the tx is mined to get back the events.
      const { events } = await tx.wait()
      const [
        TokenPurchased,
        Approval,
        Transfer,
        PaymentExecutedForArtist,
        PaymentExecutedForOwner
      ] = events

      // Events checks.
      const artistRoyalty = price
        .div(100)
        .mul(await digitalArtIstance.artistResellingRoyalty())
      const ownerRoyalty = price.sub(artistRoyalty)
      // TokenPurchased.
      expect(Number(TokenPurchased.args["tokenId"])).to.be.equal(tokenId)
      expect(TokenPurchased.args["oldOwner"]).to.be.equal(artist.address)
      expect(TokenPurchased.args["newOwner"]).to.be.equal(collector.address)
      expect(Number(TokenPurchased.args["price"])).to.be.equal(price)
      // Approval.
      expect(Approval.args["owner"]).to.be.equal(artist.address)
      expect(Number(Approval.args["approved"])).to.be.equal(0)
      expect(Number(Approval.args["tokenId"])).to.be.equal(tokenId)
      // Transfer.
      expect(Transfer.args["from"]).to.be.equal(artist.address)
      expect(Transfer.args["to"]).to.be.equal(collector.address)
      expect(Number(Transfer.args["tokenId"])).to.be.equal(tokenId)
      // PaymentExecuted for artist.
      expect(PaymentExecutedForArtist.args["to"]).to.be.equal(artist.address)
      expect(Number(PaymentExecutedForArtist.args["amount"])).to.be.equal(
        artistRoyalty
      )
      // PaymentExecuted for owner.
      expect(PaymentExecutedForOwner.args["to"]).to.be.equal(artist.address)
      expect(Number(PaymentExecutedForOwner.args["amount"])).to.be.equal(
        ownerRoyalty
      )

      // Check balances.
      const artistBalanceAfter = ethers.utils.formatEther(
        await ethers.provider.getBalance(artist.address)
      )
      const collectorBalanceAfter = ethers.utils.formatEther(
        await ethers.provider.getBalance(collector.address)
      )
      expect(Number(artistBalanceAfter) - Number(artistBalanceBefore)).to.be.lt(
        0.001
      )
      expect(
        Number(collectorBalanceBefore) - Number(collectorBalanceAfter)
      ).to.be.lt(0.001)

      // Storage checks.
      const nft = await digitalArtIstance.idToNFT(tokenId)
      expect(nft.id).to.be.equal(tokenId)
      expect(nft.sellingPrice).to.be.equal(0)
      expect(nft.dailyLicensePrice).to.be.equal(0)
      expect(nft.artist).to.be.equal(artist.address)
      expect(nft.owner).to.be.equal(collector.address)

      // Methods checks.
      expect(await digitalArtIstance.balanceOf(artist.address)).to.be.equal(0)
      expect(await digitalArtIstance.balanceOf(collector.address)).to.be.equal(
        1
      )
      expect(await digitalArtIstance.ownerOf(tokenId)).to.be.equal(
        collector.address
      )
      expect(
        await digitalArtIstance.getNumberOfTokensForOwner(artist.address)
      ).to.be.equal(0)
      expect(
        await digitalArtIstance.getNumberOfTokensForOwner(collector.address)
      ).to.be.equal(1)
      expect(
        await digitalArtIstance.getIdFromIndexForOwner(collector.address, 0)
      ).to.be.equal(tokenId)
    })

    it("Should be not possible to purchase a NFT if the NFT is not on sale", async () => {
      // Send tx.
      const tx = digitalArtIstance.connect(artist).purchaseNFT(tokenId)

      await expect(tx).to.be.reverted
    })
  })
})
