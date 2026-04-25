// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AgentFoundry} from "../src/AgentFoundry.sol";
import {MockUSDC} from "./MockUSDC.sol";

contract AgentFoundryTest is Test {
    AgentFoundry foundry;
    MockUSDC usdc;

    address creator  = makeAddr("creator");
    address smithA   = makeAddr("smithA");
    address smithB   = makeAddr("smithB");
    address stranger = makeAddr("stranger");

    bytes32 constant META = keccak256("ipfs://forge-meta-cid");
    bytes32 constant DELIV_A = keccak256("ipfs://deliverable-a");
    bytes32 constant DELIV_B = keccak256("ipfs://deliverable-b");
    bytes32 constant REASON  = keccak256("better-tests");

    function setUp() public {
        usdc = new MockUSDC();
        foundry = new AgentFoundry(address(usdc));
        usdc.mint(creator, 1_000 * 1e6);     // 1000 USDC
        vm.prank(creator);
        usdc.approve(address(foundry), type(uint256).max);
    }

    // ---- happy path ------------------------------------------------------

    function test_create_submit_pickWinner_paysWinner() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);

        vm.prank(creator);
        uint256 id = foundry.createForge(5 * 1e6, deadline, META);
        assertEq(id, 1);
        assertEq(usdc.balanceOf(address(foundry)), 5 * 1e6);

        vm.prank(smithA);
        foundry.submit(id, DELIV_A);
        vm.prank(smithB);
        foundry.submit(id, DELIV_B);
        assertEq(foundry.submitterCount(id), 2);

        uint256 balBefore = usdc.balanceOf(smithB);
        vm.prank(creator);
        foundry.pickWinner(id, smithB, REASON);
        assertEq(usdc.balanceOf(smithB) - balBefore, 5 * 1e6);
        assertEq(usdc.balanceOf(address(foundry)), 0);
    }

    function test_claimRefund_afterDeadline() public {
        uint64 deadline = uint64(block.timestamp + 10 minutes);

        vm.prank(creator);
        uint256 id = foundry.createForge(2 * 1e6, deadline, META);

        vm.warp(deadline + 1);
        uint256 balBefore = usdc.balanceOf(creator);
        // permissionless caller
        vm.prank(stranger);
        foundry.claimRefund(id);
        assertEq(usdc.balanceOf(creator) - balBefore, 2 * 1e6);
    }

    // ---- guards ----------------------------------------------------------

    function test_submit_revertsAfterDeadline() public {
        uint64 deadline = uint64(block.timestamp + 10 minutes);
        vm.prank(creator);
        uint256 id = foundry.createForge(1 * 1e6, deadline, META);

        vm.warp(deadline);
        vm.prank(smithA);
        vm.expectRevert(AgentFoundry.PastDeadline.selector);
        foundry.submit(id, DELIV_A);
    }

    function test_submit_revertsOnDuplicate() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);
        vm.prank(creator);
        uint256 id = foundry.createForge(1 * 1e6, deadline, META);

        vm.prank(smithA);
        foundry.submit(id, DELIV_A);
        vm.prank(smithA);
        vm.expectRevert(AgentFoundry.AlreadySubmitted.selector);
        foundry.submit(id, DELIV_B);
    }

    function test_pickWinner_revertsIfNotCreator() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);
        vm.prank(creator);
        uint256 id = foundry.createForge(1 * 1e6, deadline, META);

        vm.prank(smithA);
        foundry.submit(id, DELIV_A);

        vm.prank(stranger);
        vm.expectRevert(AgentFoundry.NotCreator.selector);
        foundry.pickWinner(id, smithA, REASON);
    }

    function test_pickWinner_revertsIfWinnerDidNotSubmit() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);
        vm.prank(creator);
        uint256 id = foundry.createForge(1 * 1e6, deadline, META);

        vm.prank(smithA);
        foundry.submit(id, DELIV_A);

        vm.prank(creator);
        vm.expectRevert(AgentFoundry.WinnerDidNotSubmit.selector);
        foundry.pickWinner(id, smithB, REASON);
    }

    function test_claimRefund_revertsBeforeDeadline() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);
        vm.prank(creator);
        uint256 id = foundry.createForge(1 * 1e6, deadline, META);

        vm.expectRevert(AgentFoundry.NotRefundable.selector);
        foundry.claimRefund(id);
    }

    function test_claimRefund_revertsIfAlreadyWon() public {
        uint64 deadline = uint64(block.timestamp + 1 hours);
        vm.prank(creator);
        uint256 id = foundry.createForge(1 * 1e6, deadline, META);

        vm.prank(smithA);
        foundry.submit(id, DELIV_A);
        vm.prank(creator);
        foundry.pickWinner(id, smithA, REASON);

        vm.warp(deadline + 1);
        vm.expectRevert(AgentFoundry.NotRefundable.selector);
        foundry.claimRefund(id);
    }

    function test_create_revertsOnZeroBounty() public {
        vm.prank(creator);
        vm.expectRevert(AgentFoundry.BadParams.selector);
        foundry.createForge(0, uint64(block.timestamp + 1 hours), META);
    }

    function test_create_revertsOnPastDeadline() public {
        vm.prank(creator);
        vm.expectRevert(AgentFoundry.BadParams.selector);
        foundry.createForge(1 * 1e6, uint64(block.timestamp), META);
    }
}
