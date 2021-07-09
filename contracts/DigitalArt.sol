// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.7.6 <0.9.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title DigitalArt
 * @author Giacomo Corrias (@Jeeiii) - LINKS Foundation x OTB
 * @dev NFT marketplace w/ royalty redistribution and time-based purchases (licenses) for NFTs.
 */
contract DigitalArt is ERC721URIStorage {
    using Counters for Counters.Counter;
    using EnumerableSet for EnumerableSet.UintSet;

    /** EVENTS */
    event TokenMinted(
        uint256 tokenId,
        uint256 sellingPrice,
        uint256 dailyLicensePrice,
        string tokenURI,
        address owner
    );

    event TokenPurchased(
        uint256 tokenId,
        address oldOwner,
        address newOwner,
        uint256 price
    );

    event PaymentExecuted(address payable to, uint256 amount);

    event LicensePurchased(
        uint256 tokenId,
        uint256 durationInDays,
        uint256 price,
        uint256 endDateInMillis,
        address payable sender
    );

    event SellingPriceUpdated(
        uint256 tokenId,
        uint256 oldSellingPrice,
        uint256 newSellingPrice
    );

    event DailyLicensePriceUpdated(
        uint256 tokenId,
        uint256 oldDailyLicensePrice,
        uint256 newDailyLicensePrice
    );

    /** CUSTOM TYPES */

    struct NFT {
        uint256 id; // NFT unique identifier.
        uint256 sellingPrice; // Selling price in wei (1 ETH == 10^18 wei).
        uint256 dailyLicensePrice; // Daily license price in wei (1 ETH == 10^18 wei).
        string uri; // An IPFS URI referencing a file containing the token metadata.
        address payable artist; // Who created the NFT.
        address payable owner; // Who owns the NFT.
    }

    struct License {
        uint256 tokenId; // NFT unique identifier.
        uint256 start; // Start date (in millis).
        uint256 end; // End date (in millis)
        uint256 price; // Price in wei (1 ETH == 10^18 wei).
        address recipient; // Who bought the license.
    }

    /** STORAGE */
    ///@dev Percentage of value redistribution for each NFT sale.
    uint256 public artistResellingRoyalty = 7;

    ///@dev Percentage of value redistribution for each license associated to the NFT.
    uint256 public artistLicenseRoyalty = 3;

    ///@dev Return the licenses belonging to the corresponding NFT.
    mapping(uint256 => License[]) public idToLicenses;

    ///@dev Return the NFT having the provided identifier.
    mapping(uint256 => NFT) public idToNFT;

    ///@dev Private counter for NFT identifiers.
    Counters.Counter private _tokenIds;

    ///@dev Return the token id (NFT) associated to the corresponding IPFS URI.
    mapping(string => uint256) private _uriToId;

    ///@dev Return the token ids (NFTs) belonging to the corresponding address.
    mapping(address => EnumerableSet.UintSet) private _ownerToIds;

    ///@dev Return the licenses belonging to the corresponding address.
    mapping(address => License[]) private _userToLicenses;

    /** METHODS */

    constructor() ERC721("DigitalArt", "DAT") {}

    /**
     * @notice A safe method for minting a new NFT.
     * @dev Stores on-chain the URI for the token metadata.
     * @param _tokenURI <string> - An IPFS URI referencing a file containing the token metadata.
     * @param _sellingPrice <uint256> - Selling price in wei (1 ETH == 10^18 wei).
     * @param _dailyLicensePrice <uint256> - Daily license price in wei (1 ETH == 10^18 wei).
     * @return _newTokenId <uint256> - Unique identifier of the NFT.
     */
    function safeMint(
        string memory _tokenURI,
        uint256 _sellingPrice,
        uint256 _dailyLicensePrice
    ) external returns (uint256 _newTokenId) {
        require(_uriToId[_tokenURI] == 0, "ALREADY-MINTED");
        require(_sellingPrice > 0 wei, "INVALID-SELLING-PRICE");
        require(_dailyLicensePrice > 0 wei, "INVALID-LICENSE-PRICE");

        // Mint a new token.
        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();
        _safeMint(msg.sender, newTokenId);
        _setTokenURI(newTokenId, _tokenURI);

        // NFT store.
        NFT memory nft = NFT(
            newTokenId,
            _sellingPrice,
            _dailyLicensePrice,
            _tokenURI,
            payable(msg.sender),
            payable(msg.sender)
        );

        // Storage update.
        idToNFT[newTokenId] = nft;
        _ownerToIds[msg.sender].add(newTokenId);
        _uriToId[_tokenURI] = newTokenId;

        // Approve DigitalArt contract to move this token.
        approve(address(this), newTokenId);

        // Emit event.
        emit TokenMinted(
            newTokenId,
            _sellingPrice,
            _dailyLicensePrice,
            _tokenURI,
            msg.sender
        );

        return newTokenId;
    }

    /**
     * @notice A safe method for purchasing an NFT on sale.
     * @dev Stores on-chain the URI for the token metadata.
     * @param _tokenId <uint256> - NFT unique identifier.
     */
    function purchaseNFT(uint256 _tokenId) external payable {
        NFT memory nft = idToNFT[_tokenId];
        require(
            _tokenId <= _tokenIds.current() && nft.id == _tokenId,
            "INVALID-TOKEN-ID"
        );
        require(nft.owner != msg.sender, "ALREADY-OWNER");
        require(nft.sellingPrice > 0, "NOT-FOR-SALE");
        require(nft.sellingPrice <= msg.value, "INVALID-PAYMENT");

        // Royalty redistribution.
        uint256 artistAmount = (nft.sellingPrice / 100) *
            artistResellingRoyalty;
        uint256 ownerAmount = nft.sellingPrice - artistAmount;

        // Enumerable UintSet update.
        require(_ownerToIds[msg.sender].add(nft.id), "DUPLICATE-ID");
        require(_ownerToIds[nft.owner].remove(nft.id), "NOT-REMOVED-ID");

        // Emit event.
        emit TokenPurchased(_tokenId, nft.owner, msg.sender, msg.value);

        // Token ownership transfer.
        this.safeTransferFrom(nft.owner, msg.sender, nft.id);

        // Payment.
        _pay(nft.artist, artistAmount);
        _pay(nft.owner, ownerAmount);

        // Storage update.
        nft.owner = payable(msg.sender);
        nft.sellingPrice = 0 wei;
        nft.dailyLicensePrice = 0 wei;
        idToNFT[_tokenId] = nft;
    }

    /**
     * @notice A method for purchasing a license of time-based usage for a licensable NFT.
     * @param _tokenId <uint256> - NFT unique identifier.
     * @param _days <uint256> - Duration (in days) of the time-based license usage.
     */
    function purchaseLicense(uint256 _tokenId, uint256 _days) external payable {
        NFT memory nft = idToNFT[_tokenId];
        require(
            _tokenId <= _tokenIds.current() && nft.id == _tokenId,
            "INVALID-TOKEN-ID"
        );
        require(nft.owner != msg.sender, "ALREADY-OWNER");
        require(nft.dailyLicensePrice > 0, "NOT-LICENSABLE");
        require(_days > 0, "INVALID-DURATION");
        require(nft.dailyLicensePrice * _days <= msg.value, "INVALID-PAYMENT");

        // Check if the sender has already a valid license on the provided NFT.
        checkLicenseValidityForLicensee(msg.sender, _tokenId);

        // Royalty redistribution.
        uint256 artistAmount = ((nft.dailyLicensePrice * _days) / 100) *
            artistLicenseRoyalty;
        uint256 ownerAmount = (nft.dailyLicensePrice * _days) - artistAmount;

        // Payment.
        _pay(nft.artist, artistAmount);
        _pay(nft.owner, ownerAmount);

        // Storage update.
        uint256 daysInMillis = _days * 86400000;
        License memory license = License(
            _tokenId,
            block.timestamp * 1000,
            (block.timestamp * 1000) + daysInMillis,
            msg.value,
            msg.sender
        );
        _userToLicenses[msg.sender].push(license);
        idToLicenses[_tokenId].push(license);

        // Emit event.
        emit LicensePurchased(
            _tokenId,
            _days,
            msg.value,
            (block.timestamp * 1000) + daysInMillis,
            payable(msg.sender)
        );
    }

    /**
     * @notice Update the NFT selling price.
     * @dev If the new selling price is equal to zero, the token must be considered NOT on sale, otherwise on sale.
     * @param _tokenId <uint256> - NFT unique identifier.
     * @param _newSellingPrice <uint256> - New selling price for the NFT.
     */
    function updateSellingPrice(uint256 _tokenId, uint256 _newSellingPrice)
        external
    {
        NFT memory nft = idToNFT[_tokenId];
        require(
            _tokenId <= _tokenIds.current() && nft.id == _tokenId,
            "INVALID-TOKEN-ID"
        );
        require(nft.owner == msg.sender, "NOT-OWNER");
        require(
            (nft.sellingPrice == 0 && _newSellingPrice > 0) ||
                (nft.sellingPrice > 0 && _newSellingPrice >= 0),
            "INVALID-SELLING-UPDATE"
        );

        // Emit event.
        emit SellingPriceUpdated(_tokenId, nft.sellingPrice, _newSellingPrice);

        // Approve DigitalArt contract at the first update of the price.
        if (getApproved(_tokenId) == address(0x0))
            approve(address(this), _tokenId);

        // Disapprove the DigitalArt contract when the owner decides to retire the NFT from the marketplace.
        if (_newSellingPrice == 0) approve(address(0x0), _tokenId);

        // Storage update.
        nft.sellingPrice = _newSellingPrice;
        idToNFT[_tokenId] = nft;
    }

    /**
     * @notice Update the NFT daily license price.
     * @dev If the new daily license price is equal to zero, the token must be considered NOT licensable, otherwise licensable.
     * @param _tokenId <uint256> - NFT unique identifier.
     * @param _newDailyLicensePrice <uint256> - New selling price for the NFT.
     */
    function updateDailyLicensePrice(
        uint256 _tokenId,
        uint256 _newDailyLicensePrice
    ) external {
        NFT memory nft = idToNFT[_tokenId];
        require(
            _tokenId <= _tokenIds.current() && nft.id == _tokenId,
            "INVALID-TOKEN-ID"
        );
        require(nft.owner == msg.sender, "NOT-OWNER");
        require(
            (nft.dailyLicensePrice == 0 && _newDailyLicensePrice > 0) ||
                (nft.dailyLicensePrice > 0 && _newDailyLicensePrice == 0),
            "INVALID-LICENSABLE-UPDATE"
        );

        // Emit event.
        emit DailyLicensePriceUpdated(
            _tokenId,
            nft.dailyLicensePrice,
            _newDailyLicensePrice
        );

        // Storage update.
        nft.dailyLicensePrice = _newDailyLicensePrice;
        idToNFT[_tokenId] = nft;
    }

    /**
     * @notice Send a certain amount of ethers (in wei) from the sender to the recipient.
     * @param _to <address> - Recipient address.
     * @param _amount <uint256> - Amount to be sent (in wei).
     */
    function _pay(address payable _to, uint256 _amount) internal {
        // Emit event.
        emit PaymentExecuted(_to, _amount);

        // Execute payment.
        require(_to.send(_amount), "PAYMENT-ERROR");
    }

    /**
     * @notice Return the number of NFTs owned by the address.
     * @param _owner <address> - Address of the NFTs owner.
     * @return _total <uint256[]> - Number of the NFTs owned by the address.
     */
    function getNumberOfTokensForOwner(address _owner)
        external
        view
        returns (uint256 _total)
    {
        return _ownerToIds[_owner].length();
    }

    /**
     * @notice Return the NFT identifier owned by the address which is stored at a given index.
     * @param _owner <address> - Address of the NFTs owner.
     * @param _idx <uint256> - Index where to lookup the value.
     * @return _id <uint256> - NFT unique identifier stored at the given index location.
     */
    function getIdFromIndexForOwner(address _owner, uint256 _idx)
        external
        view
        returns (uint256 _id)
    {
        return _ownerToIds[_owner].at(_idx);
    }

    /**
     * @notice Return the licenses owned by the address.
     * @param _licensee <address> - Who bought the license.
     * @return _licenses <License[]> - Unique identifiers of the licenses owned by the address.
     */
    function getAllLicensesForLicensee(address _licensee)
        external
        view
        returns (License[] memory _licenses)
    {
        return _userToLicenses[_licensee];
    }

    /**
     * @notice Return the licenses owned by the address.
     * @param _tokenId <uint256> - NFT unique identifier.
     * @return _licenses <License[]> - Licenses on the given NFT.
     */
    function getAllLicensesForToken(uint256 _tokenId)
        external
        view
        returns (License[] memory _licenses)
    {
        return idToLicenses[_tokenId];
    }

    /**
     * @notice Check if the licensee has already a valid license on the provided NFT.
     * @param _licensee <address> - Who bought the license.
     * @param _tokenId <uint256> - NFT unique identifier.
     */
    function checkLicenseValidityForLicensee(
        address _licensee,
        uint256 _tokenId
    ) internal view {
        License[] memory licensesOnToken = this.getAllLicensesForToken(
            _tokenId
        );
        for (uint256 i = 0; i < licensesOnToken.length; i++)
            require(
                (licensesOnToken[i].recipient == _licensee &&
                    licensesOnToken[i].end < block.timestamp) ||
                    (licensesOnToken[i].recipient != _licensee),
                "ALREADY-LICENSED"
            );
    }
}
