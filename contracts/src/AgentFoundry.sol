// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title AgentFoundry — multi-bidder task marketplace for autonomous agents.
/// @notice A creator posts a "forge" with USDC bounty escrowed on creation; any
///         number of agents may submit a deliverable hash; the creator picks one
///         winner and the contract releases the bounty. If the deadline passes
///         without a winner, the bounty is refundable to the creator by anyone.
contract AgentFoundry is ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable USDC;

    enum Status {
        Open,
        Won,
        Refunded
    }

    struct Forge {
        address creator;
        uint96 bounty;        // USDC has 6 decimals; uint96 fits >> 70 trillion USDC
        uint64 expiredAt;     // unix seconds
        Status status;        // packed with the above into one slot
        bytes32 metadata;     // keccak256(IPFS CID JSON: title, description, category)
    }

    uint256 public nextId = 1;
    mapping(uint256 => Forge) public forges;
    mapping(uint256 => mapping(address => bytes32)) public submissions;
    mapping(uint256 => address[]) public submitters;

    event ForgeCreated(
        uint256 indexed id,
        address indexed creator,
        uint256 bounty,
        uint64 expiredAt,
        bytes32 metadata
    );
    event Submitted(uint256 indexed id, address indexed smith, bytes32 deliverable);
    event WinnerPicked(uint256 indexed id, address indexed winner, uint256 amount, bytes32 reason);
    event Refunded(uint256 indexed id, address indexed creator, uint256 amount);

    error BadParams();
    error NotOpen();
    error PastDeadline();
    error AlreadySubmitted();
    error NotCreator();
    error WinnerDidNotSubmit();
    error NotRefundable();

    constructor(address usdc) {
        if (usdc == address(0)) revert BadParams();
        USDC = IERC20(usdc);
    }

    function createForge(uint96 bounty, uint64 expiredAt, bytes32 metadata)
        external
        nonReentrant
        returns (uint256 id)
    {
        if (bounty == 0 || expiredAt <= block.timestamp) revert BadParams();
        USDC.safeTransferFrom(msg.sender, address(this), bounty);
        unchecked {
            id = nextId++;
        }
        forges[id] = Forge({
            creator: msg.sender,
            bounty: bounty,
            expiredAt: expiredAt,
            status: Status.Open,
            metadata: metadata
        });
        emit ForgeCreated(id, msg.sender, bounty, expiredAt, metadata);
    }

    function submit(uint256 id, bytes32 deliverable) external {
        Forge storage f = forges[id];
        if (f.status != Status.Open) revert NotOpen();
        if (block.timestamp >= f.expiredAt) revert PastDeadline();
        if (submissions[id][msg.sender] != bytes32(0)) revert AlreadySubmitted();
        if (deliverable == bytes32(0)) revert BadParams();

        submissions[id][msg.sender] = deliverable;
        submitters[id].push(msg.sender);
        emit Submitted(id, msg.sender, deliverable);
    }

    function pickWinner(uint256 id, address winner, bytes32 reason) external nonReentrant {
        Forge storage f = forges[id];
        if (msg.sender != f.creator) revert NotCreator();
        if (f.status != Status.Open) revert NotOpen();
        if (submissions[id][winner] == bytes32(0)) revert WinnerDidNotSubmit();

        f.status = Status.Won;
        uint256 amount = f.bounty;
        USDC.safeTransfer(winner, amount);
        emit WinnerPicked(id, winner, amount, reason);
    }

    function claimRefund(uint256 id) external nonReentrant {
        Forge storage f = forges[id];
        if (f.status != Status.Open) revert NotRefundable();
        if (block.timestamp < f.expiredAt) revert NotRefundable();

        f.status = Status.Refunded;
        uint256 amount = f.bounty;
        USDC.safeTransfer(f.creator, amount);
        emit Refunded(id, f.creator, amount);
    }

    // -- views --------------------------------------------------------------

    function submitterCount(uint256 id) external view returns (uint256) {
        return submitters[id].length;
    }

    function getSubmitters(uint256 id) external view returns (address[] memory) {
        return submitters[id];
    }
}
