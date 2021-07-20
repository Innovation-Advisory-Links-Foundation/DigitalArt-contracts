// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.7.6 <0.9.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title DigitalArt
 * @author Giacomo Corrias (@Jeeiii) - LINKS Foundation x OTB
 * @dev NFT marketplace w/ royalty redistribution and time-based purchases (licenses) for NFTs.
 */
contract DigitalArt is ERC721URIStorage, Ownable {
    using Counters for Counters.Counter;

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
        uint256 price,
        uint256 timestamp
    );

    event LicensePurchased(
        uint256 tokenId,
        uint256 durationInDays,
        uint256 price,
        uint256 endDateInMillis,
        address payable sender,
        uint256 timestamp
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

    event PaymentExecuted(address payable to, uint256 amount);

    event InfringmentAttemptsRecorded(uint256 tokenId, uint256 timestamp, bytes32 infringmentAttemptsHash);

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

    ///@dev Return the NFT having the provided identifier.
    mapping(uint256 => NFT) public idToNFT;

    ///@dev Private counter for NFT identifiers.
    Counters.Counter private _tokenIds;

    ///@dev Return the token id (NFT) associated to the corresponding IPFS URI.
    mapping(string => uint256) private _uriToId;

    ///@dev Return the licenses belonging to the corresponding NFT.
    mapping(uint256 => License[]) internal _idToLicenses;

    /** METHODS */

    constructor() ERC721("DigitalArt", "DAT") Ownable() {}

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
     * @param _timestamp <uint256> - Date and time when the tx is sent to the network.
     */
    function purchaseNFT(uint256 _tokenId, uint256 _timestamp)
        external
        payable
    {
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

        // Emit event.
        emit TokenPurchased(
            _tokenId,
            nft.owner,
            msg.sender,
            msg.value,
            _timestamp
        );

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
     * @param _timestamp <uint256> - Date and time when the tx is sent to the network.
     */
    function purchaseLicense(
        uint256 _tokenId,
        uint256 _days,
        uint256 _timestamp
    ) external payable {
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
        checkLicenseValidityForLicensee(msg.sender, _tokenId, _timestamp);

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
            _timestamp,
            _timestamp + daysInMillis,
            msg.value,
            msg.sender
        );
        _idToLicenses[_tokenId].push(license);

        // Emit event.
        emit LicensePurchased(
            _tokenId,
            _days,
            msg.value,
            _timestamp + daysInMillis,
            payable(msg.sender),
            _timestamp
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
                (nft.dailyLicensePrice > 0 && _newDailyLicensePrice >= 0),
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
     * @notice Update the IPR infringment attempts for a specific NFT.
     * @dev The IPR infringment attempts are obtained from a Google API (Web Detection) and the hash is calculated from the client perspective.
     * @param _tokenId <uint256> - NFT unique identifier.
     * @param _timestamp <uint256> - Date and time when the IPR infringement attempts are detected.
     * @param _infringmentAttemptsHash <string> - The hash of the file where the infringement attempts are listed.
     */
    function recordIPRInfringementAttempts(
        uint256 _tokenId,
        uint256 _timestamp,
        bytes32 _infringmentAttemptsHash
    ) external onlyOwner() {
        NFT memory nft = idToNFT[_tokenId];
        require(
            _tokenId <= _tokenIds.current() && nft.id == _tokenId,
            "INVALID-TOKEN-ID"
        );    

        require(_infringmentAttemptsHash != "", "INVALID-DATA-HASH");

        // Emit event.
        emit InfringmentAttemptsRecorded(_tokenId, _timestamp, _infringmentAttemptsHash);
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
     * @notice Return the licenses owned by the address.
     * @param _tokenId <uint256> - NFT unique identifier.
     * @return _licenses <License[]> - Licenses on the given NFT.
     */
    function getAllLicensesForToken(uint256 _tokenId)
        external
        view
        returns (License[] memory _licenses)
    {
        return _idToLicenses[_tokenId];
    }

    /**
     * @notice Check if the licensee has already a valid license on the provided NFT.
     * @param _licensee <address> - Who bought the license.
     * @param _tokenId <uint256> - NFT unique identifier.
     * @param _timestamp <uint256> - Current date and time.
     */
    function checkLicenseValidityForLicensee(
        address _licensee,
        uint256 _tokenId,
        uint256 _timestamp
    ) internal view {
        License[] memory licensesOnToken = this.getAllLicensesForToken(
            _tokenId
        );
        for (uint256 i = 0; i < licensesOnToken.length; i++)
            require(
                (licensesOnToken[i].recipient == _licensee &&
                    licensesOnToken[i].end < _timestamp) ||
                    (licensesOnToken[i].recipient != _licensee),
                "ALREADY-LICENSED"
            );
    }
}
