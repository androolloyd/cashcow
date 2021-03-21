// SPDX-License-Identifier: MIT
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";

import {
ISuperfluid,
ISuperToken,
ISuperApp,
ISuperAgreement,
SuperAppDefinitions
} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

import {
IConstantFlowAgreementV1
} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";

import {SuperAppBase} from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol";

import {CFALibrary} from "./CFALibrary.sol";

contract RedirectAll is SuperAppBase, CFALibrary, ERC721 {
    address internal _owner; // in this case, receiver is THE BUSINESS

    struct Lien {
        int96 flowRate;
        uint256 expiry;
        uint256 duration;
        int96 currentFlowRate;
    }

    mapping(uint256 => Lien) public liens;
    int96 public totalLiens;
    uint256 public lastId;

    constructor(
        address owner,
        ISuperfluid host,
        IConstantFlowAgreementV1 cfa,
        ISuperToken acceptedToken,
        string memory name,
        string memory symbol
    ) CFALibrary(host, cfa, acceptedToken) ERC721(name, symbol) {
        require(address(owner) != address(0), "receiver/owner is zero address");
        require(!host.isApp(ISuperApp(owner)), "receiver/owner is an app");

        _owner = owner;

        uint256 configWord =
        SuperAppDefinitions.APP_LEVEL_FINAL |
        SuperAppDefinitions.BEFORE_AGREEMENT_CREATED_NOOP |
        SuperAppDefinitions.BEFORE_AGREEMENT_UPDATED_NOOP |
        SuperAppDefinitions.BEFORE_AGREEMENT_TERMINATED_NOOP;

        host.registerApp(configWord);
    }

    /**************************************************************************
     * Redirect Logic
     *************************************************************************/

    function currentReceiver()
    external
    view
    returns (
        uint256 startTime,
        address receiver,
        int96 flowRate
    )
    {
        if (_owner != address(0)) {
            (startTime, flowRate, , ) = _cfa.getFlow(_acceptedToken, address(this), _owner);
            receiver = _owner;
        }
    }

    event ReceiverChanged(address receiver); //what is this?

    /// @dev If a new stream is opened, or an existing one is updated
    function _updateOutflow(bytes calldata ctx) private returns (bytes memory newCtx) {
        newCtx = ctx;
        // @dev This will give me the new flowRate, as it is called in after callbacks
        int96 netFlowRate = _cfa.getNetFlow(_acceptedToken, address(this));
        (, int96 ownerFlow, , ) = _cfa.getFlow(_acceptedToken, address(this), _owner); // CHECK: unclear what happens if flow doesn't exist.
        int96 outFlowRate = ownerFlow + totalLiens; // CHECK: unclear what happens if flow doesn't exist.
        int96 inFlowRate = netFlowRate + outFlowRate;
        if (inFlowRate < 0) inFlowRate = inFlowRate * -1;
        // HERE WE HAVE TO CHECK IF WE ARE ABOVE THE MINIMUM LIENS OR NOT.
        // IF WE ARE, THEN GO FORWARD. IF WE ARE NOT, THEN WE HAVE TO EAT FROM THE LAST LIEN

        //happy case, money go up
        if (inFlowRate > outFlowRate) {
            int96 flowToIncrease = inFlowRate - outFlowRate;
            // check if Liens need to be rehydrated
            // need to check, from the bottom, if the liens were touched
            uint256 ID = 0;
            int96 lienFlow = 0;
            while (liens[ID].currentFlowRate != liens[ID].flowRate && ID <= lastId) {
                // rehydrate flows accordingly...
                (, lienFlow, , ) = _cfa.getFlow(_acceptedToken, address(this), ownerOf(ID));
                int96 newFlow = liens[ID].flowRate - liens[ID].currentFlowRate;
                // check if the flowToIncrease is enough to fill the NFT
                if (flowToIncrease < newFlow) newFlow = flowToIncrease;
                //if user has a flow, updateFlow
                //if user doesn't have a flow, create
                if (lienFlow > 0) newCtx = _updateFlow(ownerOf(ID), lienFlow + newFlow, newCtx);
                else newCtx = _createFlow(ownerOf(ID), newFlow, newCtx);
                liens[ID].currentFlowRate = newFlow;
                ID++;
                flowToIncrease -= newFlow;
                if (flowToIncrease == 0) return newCtx;
            }
            // now send all excess to the owner
            if (outFlowRate > 0) {
                return newCtx = _updateFlow(_owner, flowToIncrease + ownerFlow, newCtx);
            } else {
                return newCtx = _createFlow(_owner, flowToIncrease, newCtx);
            }
        }
        // bad case, money go down
        if (inFlowRate > totalLiens) {
            // only need to edit (OR CREATE) outgoing flow to owner
            // FALSE! if I had previously reduced the liens, I have to rehydrate them...
            if (ownerFlow > 0) {
                // in this case, we never reduced the Liens, so we can proceed
                newCtx = _updateFlow(_owner, inFlowRate, newCtx);
            } else {
                newCtx = _createFlow(_owner, inFlowRate, newCtx);
            }
        } else if (inFlowRate == totalLiens) {
            // @dev if inFlowRate is zero, delete outflow.
            newCtx = _deleteFlow(address(this), _owner, newCtx);
        } else {
            // HERE WE NEED TO FUCK UP THE LIENS THEMSELVES, SORRY GUYS
            int96 flowToReduce = inFlowRate;
            // first of all, delete outflow to owner
            newCtx = _deleteFlow(address(this), _owner, newCtx);
            flowToReduce -= ownerFlow;
            // secondly, loop through the Liens, deleting / updating the flows.
            uint256 ID = lastId;
            int96 lienFlow = 0;
            while (liens[ID].flowRate >= (flowToReduce)) {
                if (liens[ID].flowRate > flowToReduce) {
                    liens[ID].currentFlowRate = liens[ID].flowRate - flowToReduce;
                    //updateFlow;
                    return newCtx = _updateFlow(ownerOf(ID), liens[ID].flowRate - flowToReduce, newCtx);
                } else {
                    liens[ID].currentFlowRate = 0;
                    // check if there is more than one flow.
                    // If one, delete, if more, reduce amount
                    (, lienFlow, , ) = _cfa.getFlow(_acceptedToken, address(this), ownerOf(ID));
                    if (lienFlow == liens[ID].flowRate) {
                        newCtx = _deleteFlow(address(this), ownerOf(ID), newCtx);
                    } else {
                        newCtx = _updateFlow(ownerOf(ID), lienFlow - liens[ID].flowRate, newCtx);
                    }
                }
                if (ID > 0) ID--;
                flowToReduce -= liens[ID].flowRate;
            }
        }
    }

    function _newLien(uint256 ID) internal {
        (, int96 outFlowRate, , ) = _cfa.getFlow(_acceptedToken, address(this), _owner); //CHECK: unclear what happens if flow doesn't exist.
        require(outFlowRate > liens[ID].flowRate, "You are not receiving enough");
        totalLiens += liens[ID].flowRate;
    }

    // @dev Change the Receiver of the total flow
    function _moveLien(address newReceiver, uint256 tokenId) internal {
        require(newReceiver != address(0), "New receiver is zero address");
        // @dev because our app is registered as final, we can't take downstream apps
        require(!_host.isApp(ISuperApp(newReceiver)), "New receiver can not be a superApp");
        if (newReceiver == _owner) return;

        // @dev delete flow to old receiver
        address oldOwner = ownerOf(tokenId);

        (, int96 outFlowRate, , ) = _cfa.getFlow(_acceptedToken, address(this), oldOwner); //CHECK: unclear what happens if flow doesn't exist.
        if (outFlowRate == liens[tokenId].flowRate) {
            _deleteFlow(address(this), oldOwner);
        } else {
            // reduce the outflow by liens[tokenId].flowRate;
            _updateFlow(oldOwner, outFlowRate - liens[tokenId].flowRate);
        }
        // @dev create flow to new receiver
        (, outFlowRate, , ) = _cfa.getFlow(_acceptedToken, address(this), newReceiver); //CHECK: unclear what happens if flow doesn't exist.
        if (outFlowRate == 0) {
            _createFlow(newReceiver, _cfa.getNetFlow(_acceptedToken, address(this)));
        } else {
            // increase the outflow by liens[tokenId].flowRate
            _updateFlow(_owner, outFlowRate + liens[tokenId].flowRate);
        }

        // @dev set global receiver to new receiver aka owner
        _owner = newReceiver;

        emit ReceiverChanged(_owner);
    }

    /**************************************************************************
     * SuperApp callbacks
     *************************************************************************/

    function afterAgreementCreated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, // _agreementId,
        bytes calldata, /*_agreementData*/
        bytes calldata, // _cbdata,
        bytes calldata _ctx
    ) external override onlyExpected(_superToken, _agreementClass) onlyHost returns (bytes memory newCtx) {
        return _updateOutflow(_ctx);
    }

    function afterAgreementUpdated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata, //agreementData,
        bytes calldata, //_cbdata,
        bytes calldata _ctx
    ) external override onlyExpected(_superToken, _agreementClass) onlyHost returns (bytes memory newCtx) {
        return _updateOutflow(_ctx);
    }

    function afterAgreementTerminated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, //_agreementId,
        bytes calldata, /*_agreementData*/
        bytes calldata, //_cbdata,
        bytes calldata _ctx
    ) external override onlyHost returns (bytes memory newCtx) {
        // According to the app basic law, we should never revert in a termination callback
        if (!_isSameToken(_superToken) || !_isCFAv1(_agreementClass)) return _ctx;
        return _updateOutflow(_ctx);
    }

    function _isSameToken(ISuperToken superToken) private view returns (bool) {
        return address(superToken) == address(_acceptedToken);
    }

    function _isCFAv1(address agreementClass) private view returns (bool) {
        return
        ISuperAgreement(agreementClass).agreementType() ==
        keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1");
    }

    modifier onlyHost() {
        require(msg.sender == address(_host), "RedirectAll: support only one host");
        _;
    }

    modifier onlyExpected(ISuperToken superToken, address agreementClass) {
        require(_isSameToken(superToken), "RedirectAll: not accepted token");
        require(_isCFAv1(agreementClass), "RedirectAll: only CFAv1 supported");
        _;
    }
}
