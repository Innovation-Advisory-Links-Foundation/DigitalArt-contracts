// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.7.6 <0.9.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title DigitalArt
 * @author Giacomo Corrias (@Jeeiii) - LINKS Foundation x OTB
 * @dev NFT marketplace w/ royalty redistribution and time-based purchases (licenses) for NFTs.
 */
contract DigitalArt is ERC721URIStorage {
    using Counters for Counters.Counter;

    /** EVENTS */
    // Price change when reselling.

    /** CUSTOM TYPES */

    struct NFT {
        uint256 id; // Token unique identifier.
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

    ///@dev Return the licenses belonging to the corresponding NFT.
    mapping(uint256 => License[]) public tokenToLicenses;

    ///@dev Return the NFT having the provided identifier.
    mapping(uint256 => NFT) public idToNFT;

    ///@dev Private counter for NFT identifiers.
    Counters.Counter private _tokenIds;

    ///@dev Return the token id (NFT) associated to the corresponding IPFS URI.
    mapping(string => uint256) private _uriToId;

    ///@dev Return the token ids (NFTs) belonging to the corresponding address.
    mapping(address => uint256[]) private _ownerToIds;

    ///@dev Return the licenses belonging to the corresponding address.
    mapping(address => License[]) private _userToLicenses;

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
        NFT memory nft =
            NFT(
                newTokenId,
                _sellingPrice,
                _dailyLicensePrice,
                _tokenURI,
                payable(msg.sender),
                payable(msg.sender)
            );

        // Storage update.
        idToNFT[newTokenId] = nft;
        _ownerToIds[msg.sender].push(newTokenId);
        _uriToId[_tokenURI] = newTokenId;

        return newTokenId;
    }

    /**
     * @notice Return the NFT ids owned by the address.
     * @param _owner <address> - Address of the NFTs owner.
     * @return _ids <uint256[]> - Unique identifiers of the NFTs owned by the address.
     */
    function getAllTokenIds(address _owner)
        external
        view
        returns (uint256[] memory _ids)
    {
        return _ownerToIds[_owner];
    }

    /**
     * @notice Return the licenses owned by the address.
     * @param _owner <address> - Address of the licenses owner.
     * @return _licenses <License[]> - Unique identifiers of the licenses owned by the address.
     */
    function getAllLicenses(address _owner)
        external
        view
        returns (License[] memory _licenses)
    {
        return _userToLicenses[_owner];
    }
}
