//SPDX-License-Identifier: MIT
pragma solidity ^0.7.1;

import {RedirectAll, ISuperToken, IConstantFlowAgreementV1, ISuperfluid} from "./RedirectAll.sol";

contract TradeableCashflow is RedirectAll {
    constructor(
        address owner,
        ISuperfluid host,
        IConstantFlowAgreementV1 cfa,
        ISuperToken acceptedToken,
        string memory name,
        string memory symbol
    ) RedirectAll(owner, host, cfa, acceptedToken, name, symbol) {}

    function createNFT(int96 flowRate, uint256 duration) external {
        require(msg.sender == _owner, "Only owner");
        // creates an NFT based on a set flowRate and duration
        liens[lastId] = Lien(flowRate, 0, duration, flowRate);
        _mint(_owner, lastId);
        _newLien(lastId);
        lastId += 1;
    }

    //now I will insert a nice little hook in the _transfer, including the RedirectAll function I need
    function _beforeTokenTransfer(
        address, /*from*/
        address to,
        uint256 tokenId
    ) internal override {
        require(to != address(this), "Do NOT transfer NFT to contract");
        if (liens[tokenId].expiry == 0) liens[tokenId].expiry = block.timestamp + liens[tokenId].duration;
        _moveLien(to, tokenId);
    }
}
