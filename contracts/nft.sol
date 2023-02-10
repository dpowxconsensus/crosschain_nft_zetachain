// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Burnable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@zetachain/protocol-contracts/contracts/ZetaInteractor.sol";
import "@zetachain/protocol-contracts/contracts/interfaces/ZetaInterfaces.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";

interface CrossChainWarriorsErrors {
    error InvalidMessageType();

    error InvalidTransferCaller();

    error ErrorApprovingZeta();
}

contract NFT is
    ERC721,
    ERC721URIStorage,
    ERC721Burnable,
    Ownable,
    ZetaInteractor,
    ZetaReceiver,
    CrossChainWarriorsErrors
{
    event SendNFTCrossChain(
        address from,
        address to,
        uint256 dstId,
        uint256 tokenId
    );

    event NFTReceivedFromChain(
        address from,
        address to,
        uint256 _srcChainId,
        uint256 tokenId
    );

    using Counters for Counters.Counter;

    Counters.Counter private _tokenIdCounter;
    bytes32 public constant CROSS_CHAIN_TRANSFER_MESSAGE =
        keccak256("CROSS_CHAIN_TRANSFER");

    uint256 _destinationGasLimit;
    IERC20 internal _zetaToken;
    ZetaTokenConsumer private _zetaConsumer;

    constructor(
        address connectorAddress_,
        address zetaTokenAddress,
        address zetaConsumerAddress,
        uint256 _dstGasLimit
    ) ERC721("NFT", "SNFT") ZetaInteractor(connectorAddress_) {
        _destinationGasLimit = _dstGasLimit;
        _zetaToken = IERC20(zetaTokenAddress);
        _zetaConsumer = ZetaTokenConsumer(zetaConsumerAddress);
    }

    function _safeMint(address to, string memory uri) internal {
        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        _safeMint(to, tokenId);
        _setTokenURI(tokenId, uri);
    }

    function safeMint(address to, string memory uri) public payable {
        require(msg.value >= 1 wei, "1 wei required to mint");
        _safeMint(to, uri);
    }

    // The following functions are overrides required by Solidity.

    function _burn(
        uint256 tokenId
    ) internal override(ERC721, ERC721URIStorage) {
        super._burn(tokenId);
    }

    function tokenURI(
        uint256 tokenId
    ) public view override(ERC721, ERC721URIStorage) returns (string memory) {
        return super.tokenURI(tokenId);
    }

    function transferNFTCrossChain(
        uint256 _dstChainId,
        address to,
        uint256 tokenId
    ) public payable {
        require(msg.value > 0, "provide ether for dst gas payment");
        if (!_isValidChainId(_dstChainId)) revert InvalidDestinationChainId();

        bytes memory payload = abi.encode(
            CROSS_CHAIN_TRANSFER_MESSAGE,
            tokenId,
            tokenURI(tokenId),
            to,
            msg.sender
        );

        uint256 crossChainGas = 18 * (10 ** 18);
        uint256 zetaValueAndGas = _zetaConsumer.getZetaFromEth{
            value: msg.value
        }(address(this), crossChainGas);
        _zetaToken.approve(address(connector), zetaValueAndGas);

        // burn the nft on src chain
        _burn(tokenId);
        connector.send(
            ZetaInterfaces.SendInput({
                destinationChainId: _dstChainId,
                destinationAddress: interactorsByChainId[_dstChainId],
                destinationGasLimit: _destinationGasLimit,
                message: payload,
                zetaValueAndGas: zetaValueAndGas,
                zetaParams: abi.encode("")
            })
        );

        emit SendNFTCrossChain(msg.sender, to, _dstChainId, tokenId);
    }

    // mint nft to receipent user
    function onZetaMessage(
        ZetaInterfaces.ZetaMessage calldata zetaMessage
    ) external override isValidMessageCall(zetaMessage) {
        (
            bytes32 messageType,
            uint256 tokenId,
            string memory tokenUri,
            address to,
            address from
        ) = abi.decode(
                zetaMessage.message,
                (bytes32, uint256, string, address, address)
            );

        if (messageType != CROSS_CHAIN_TRANSFER_MESSAGE)
            revert InvalidMessageType();

        _safeMint(to, tokenUri);
        emit NFTReceivedFromChain(from, to, zetaMessage.sourceChainId, tokenId);
    }

    function onZetaRevert(
        ZetaInterfaces.ZetaRevert calldata zetaRevert
    ) external override isValidRevertCall(zetaRevert) {
        (
            bytes32 messageType,
            uint256 tokenId,
            string memory tokenUri, // ,address to,
            ,
            address from
        ) = abi.decode(
                zetaRevert.message,
                (bytes32, uint256, string, address, address)
            );

        if (messageType != CROSS_CHAIN_TRANSFER_MESSAGE)
            revert InvalidMessageType();

        _safeMint(from, tokenId);
        _setTokenURI(tokenId, tokenUri);
    }

    receive() external payable {}
}
