// SPDX-License-Identifier: GPL-3.0

pragma solidity >=0.7.6 <0.9.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

/**
 * @title DigitalArt
 * @author Giacomo Corrias (@Jeeiii) - LINKS Foundation x OTB
 * @dev To do.
 */
contract DigitalArt is ERC721URIStorage {

    using Counters for Counters.Counter;   
    // Private counter for NFT identifiers.
    Counters.Counter private _tokenIds;
    
    constructor() ERC721("DigitalArt", "DAT") {}

    /**
     * @dev To do.
     * @param _owner <address> - To do.
     * @param _tokenURI <string> - To do.
     * @return _newTokenId <uint256> - To do.
     */ 
    function safeMint (address _owner, string memory _tokenURI) external returns(uint256 _newTokenId) {
        _tokenIds.increment();
        
        // Mint a new token.
        uint256 newTokenId = _tokenIds.current();
        _safeMint(_owner, newTokenId);
        _setTokenURI(newTokenId, _tokenURI);
        
        return newTokenId;
    }
}