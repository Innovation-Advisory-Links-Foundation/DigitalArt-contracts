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
  let collectorA: SignerWithAddress
  let collectorB: SignerWithAddress
  let collectorC: SignerWithAddress

  before(async () => {
    // Get contract factory.
    DigitalArt = await ethers.getContractFactory("DigitalArt")
    // Create a new istance.
    digitalArtIstance = await DigitalArt.deploy()
    await digitalArtIstance.deployed()

    // Get users (signers) accounts.
    signers = await ethers.getSigners()
    artist = signers[0]
    collectorA = signers[1]
    collectorB = signers[2]
    collectorC = signers[3]
  })

  describe("# NFT Minting", () => {
    // NFT info.
    const expectedTokenId = 1
    const tokenURI = "ipfs://test/metadata.json"
    const sellingPrice = ethers.utils.parseEther("0.0001")
    const dailyLicensePrice = 1000000

    it("Should not be possible to mint a token with an invalid selling price", async () => {
      // Send tx.
      const tx = digitalArtIstance
        .connect(artist)
        .safeMint(tokenURI, 0, dailyLicensePrice)

      await expect(tx).to.be.reverted
    })

    it("Should not be possible to mint a token with an invalid daily license price", async () => {
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

    it("Should not be possible to mint a token with the same IPFS CID twice", async () => {
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

    it("Should not be possible to purchase a non minted token", async () => {
      // Send tx.
      const tx = digitalArtIstance.connect(artist).purchaseNFT(1000)

      await expect(tx).to.be.reverted
    })

    it("Should not be possible to purchase a NFT if the sender is the owner", async () => {
      // Send tx.
      const tx = digitalArtIstance.connect(artist).purchaseNFT(tokenId)

      await expect(tx).to.be.reverted
    })

    it("Should not be possible to purchase a NFT if the sender sends an amount lower than the NFT price", async () => {
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
        await ethers.provider.getBalance(collectorA.address)
      )

      // Send tx.
      const tx = await digitalArtIstance
        .connect(collectorA)
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
      expect(TokenPurchased.args["newOwner"]).to.be.equal(collectorA.address)
      expect(Number(TokenPurchased.args["price"])).to.be.equal(price)
      // Approval.
      expect(Approval.args["owner"]).to.be.equal(artist.address)
      expect(Number(Approval.args["approved"])).to.be.equal(0)
      expect(Number(Approval.args["tokenId"])).to.be.equal(tokenId)
      // Transfer.
      expect(Transfer.args["from"]).to.be.equal(artist.address)
      expect(Transfer.args["to"]).to.be.equal(collectorA.address)
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
        await ethers.provider.getBalance(collectorA.address)
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
      expect(nft.owner).to.be.equal(collectorA.address)

      // Methods checks.
      expect(await digitalArtIstance.balanceOf(artist.address)).to.be.equal(0)
      expect(await digitalArtIstance.balanceOf(collectorA.address)).to.be.equal(
        1
      )
      expect(await digitalArtIstance.ownerOf(tokenId)).to.be.equal(
        collectorA.address
      )
      expect(
        await digitalArtIstance.getNumberOfTokensForOwner(artist.address)
      ).to.be.equal(0)
      expect(
        await digitalArtIstance.getNumberOfTokensForOwner(collectorA.address)
      ).to.be.equal(1)
      expect(
        await digitalArtIstance.getIdFromIndexForOwner(collectorA.address, 0)
      ).to.be.equal(tokenId)
    })

    it("Should not be possible to purchase a NFT if the NFT is not on sale", async () => {
      // Send tx.
      const tx = digitalArtIstance.connect(artist).purchaseNFT(tokenId)

      await expect(tx).to.be.reverted
    })
  })

  describe("# NFT Reselling", () => {
    const tokenId = 1
    const newSellingPrice = ethers.utils.parseEther("0.01")

    it("Should not be possible to update the selling price of a non minted token", async () => {
      // Send tx.
      const tx = digitalArtIstance
        .connect(collectorA)
        .updateSellingPrice(1000, newSellingPrice)

      await expect(tx).to.be.reverted
    })

    it("Should not be possible to update the selling price of a NFT if the sender is the owner", async () => {
      // Send tx.
      const tx = digitalArtIstance
        .connect(artist)
        .updateSellingPrice(tokenId, newSellingPrice)

      await expect(tx).to.be.reverted
    })

    it("Should not be possible to update with a same selling price", async () => {
      // Send tx.
      const tx = digitalArtIstance
        .connect(collectorA)
        .updateSellingPrice(tokenId, 0)

      await expect(tx).to.be.reverted
    })

    it("Should be possible to put on sale the NFT", async () => {
      // Send tx.
      const tx = await digitalArtIstance
        .connect(collectorA)
        .updateSellingPrice(tokenId, newSellingPrice)

      // Wait until the tx is mined to get back the events.
      const { events } = await tx.wait()
      const [SellingPriceUpdated, Approval] = events

      // Events checks.
      // SellingPriceUpdated.
      expect(Number(SellingPriceUpdated.args["tokenId"])).to.be.equal(tokenId)
      expect(SellingPriceUpdated.args["oldSellingPrice"]).to.be.equal(0)
      expect(Number(SellingPriceUpdated.args["newSellingPrice"])).to.be.equal(
        Number(newSellingPrice)
      )
      // Approval.
      expect(Approval.args["owner"]).to.be.equal(collectorA.address)
      expect(Approval.args["approved"]).to.be.equal(digitalArtIstance.address)
      expect(Number(Approval.args["tokenId"])).to.be.equal(tokenId)

      // Storage checks.
      const nft = await digitalArtIstance.idToNFT(tokenId)
      expect(nft.id).to.be.equal(tokenId)
      expect(Number(nft.sellingPrice)).to.be.equal(Number(newSellingPrice))
    })

    it("Should be possible to re-purchase the NFT", async () => {
      // Send tx.
      const tx = await digitalArtIstance
        .connect(collectorB)
        .purchaseNFT(tokenId, { value: newSellingPrice })

      // Storage checks.
      const nft = await digitalArtIstance.idToNFT(tokenId)
      expect(nft.id).to.be.equal(tokenId)
      expect(nft.sellingPrice).to.be.equal(0)
      expect(nft.dailyLicensePrice).to.be.equal(0)
      expect(nft.artist).to.be.equal(artist.address)
      expect(nft.owner).to.be.equal(collectorB.address)
    })
  })

  describe("# NFT Licensable", () => {
    const tokenId = 1
    const newDailyLicensePrice = 10 // Price in wei.
    const days = 60
    const price = ethers.utils.parseEther("0.0000000000000006")

    it("Should not be possible to buy a license for a non minted token", async () => {
      // Send tx.
      const tx = digitalArtIstance
        .connect(collectorC)
        .purchaseLicense(1000, days)

      await expect(tx).to.be.reverted
    })

    it("Should not be possible to buy a license if the licensee is the NFT owner", async () => {
      // Send tx.
      const tx = digitalArtIstance
        .connect(collectorB)
        .purchaseLicense(tokenId, days)

      await expect(tx).to.be.reverted
    })

    it("Should not be possible to buy a license if the licensee provides an invalid days amount", async () => {
      // Send tx.
      const tx = digitalArtIstance
        .connect(collectorC)
        .purchaseLicense(tokenId, 0)

      await expect(tx).to.be.reverted
    })

    it("Should not be possible to buy a license if the licensee provides an invalid payment", async () => {
      // Send tx.
      const tx = digitalArtIstance
        .connect(collectorC)
        .purchaseLicense(tokenId, days, { value: 60 })

      await expect(tx).to.be.reverted
    })

    it("Should be possible to make a NFT available for licensing", async () => {
      // Send tx.
      const tx = await digitalArtIstance
        .connect(collectorB)
        .updateDailyLicensePrice(tokenId, newDailyLicensePrice)

      // Wait until the tx is mined to get back the events.
      const { events } = await tx.wait()
      const [DailyLicensePriceUpdated] = events

      // Events checks.
      // DailyLicensePriceUpdated.
      expect(Number(DailyLicensePriceUpdated.args["tokenId"])).to.be.equal(
        tokenId
      )
      expect(DailyLicensePriceUpdated.args["oldDailyLicensePrice"]).to.be.equal(
        0
      )
      expect(
        Number(DailyLicensePriceUpdated.args["newDailyLicensePrice"])
      ).to.be.equal(Number(newDailyLicensePrice))

      // Storage checks.
      const nft = await digitalArtIstance.idToNFT(tokenId)
      expect(nft.id).to.be.equal(tokenId)
      expect(Number(nft.dailyLicensePrice)).to.be.equal(
        Number(newDailyLicensePrice)
      )
    })

    it("Should be possible to purchase a license on a NFT", async () => {
      // Get balances before sending the tx.
      const artistBalanceBefore = ethers.utils.formatEther(
        await ethers.provider.getBalance(artist.address)
      )
      const collectorBalanceBefore = ethers.utils.formatEther(
        await ethers.provider.getBalance(collectorB.address)
      )

      // Send tx.
      const tx = await digitalArtIstance
        .connect(collectorC)
        .purchaseLicense(tokenId, days, { value: price })

      // Wait until the tx is mined to get back the events.
      const { events } = await tx.wait()
      const [
        PaymentExecutedForArtist,
        PaymentExecutedForOwner,
        LicensePurchased
      ] = events

      // Events checks.
      const artistRoyalty = price
        .div(100)
        .mul(await digitalArtIstance.artistLicenseRoyalty())
      const ownerRoyalty = price.sub(artistRoyalty)

      // PaymentExecuted for artist.
      expect(PaymentExecutedForArtist.args["to"]).to.be.equal(artist.address)
      expect(Number(PaymentExecutedForArtist.args["amount"])).to.be.equal(
        artistRoyalty
      )
      // PaymentExecuted for owner.
      expect(PaymentExecutedForOwner.args["to"]).to.be.equal(collectorB.address)
      expect(Number(PaymentExecutedForOwner.args["amount"])).to.be.equal(
        ownerRoyalty
      )
      // LicensePurchased.
      expect(Number(LicensePurchased.args["tokenId"])).to.be.equal(tokenId)
      expect(Number(LicensePurchased.args["durationInDays"])).to.be.equal(days)
      expect(Number(LicensePurchased.args["price"])).to.be.equal(price)
      expect(LicensePurchased.args["sender"]).to.be.equal(collectorC.address)

      // Check balances.
      const artistBalanceAfter = ethers.utils.formatEther(
        await ethers.provider.getBalance(artist.address)
      )
      const collectorBalanceAfter = ethers.utils.formatEther(
        await ethers.provider.getBalance(collectorA.address)
      )
      expect(Number(artistBalanceAfter) - Number(artistBalanceBefore)).to.be.lt(
        0.0000000000000006
      )
      expect(
        Number(collectorBalanceBefore) - Number(collectorBalanceAfter)
      ).to.be.lt(0.0000000000000006)

      // Storage checks.
      const nft = await digitalArtIstance.idToNFT(tokenId)
      expect(nft.id).to.be.equal(tokenId)
      expect(nft.dailyLicensePrice).to.be.equal(newDailyLicensePrice)

      // Methods checks.
      expect(
        (await digitalArtIstance.getAllLicensesForToken(tokenId)).length
      ).to.be.equal(1)
      expect(
        (await digitalArtIstance.getAllLicensesForLicensee(collectorC.address))
          .length
      ).to.be.equal(1)
    })

    it("Should not be possible to buy a license if the licensee has already a valid license for the NFT", async () => {
      // Send tx.
      const tx = digitalArtIstance
        .connect(collectorC)
        .purchaseLicense(tokenId, days, { value: price })

      await expect(tx).to.be.reverted
    })
  })
})
