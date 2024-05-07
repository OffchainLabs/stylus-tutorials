// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.20;

import 'nitro-contracts/src/bridge/Inbox.sol';
import 'nitro-contracts/src/bridge/Outbox.sol';

/// @title Greeter contract (L1 side)
/// @notice This is part of a set of contracts deployed in 2 connected layers, that update their values using cross-chain messages
contract GreeterL1 {
  string greeting; // Greeting message
  address public l2Target; // Address of the counterpart contract
  IInbox public inbox; // Address of the Inbox contract

  /// Event emitted when sending an L1-to-L2 message to update the greeting on the L2 contract
  event RetryableTicketCreated(uint256 indexed ticketId);

  constructor(string memory _greeting, address _l2Target, address _inbox) {
    greeting = _greeting;
    l2Target = _l2Target;
    inbox = IInbox(_inbox);
  }

  function greet() public view returns (string memory) {
    return greeting;
  }

  function updateL2Target(address _l2Target) public {
    l2Target = _l2Target;
  }

  /// @notice only l2Target can update the greeting message
  function setGreeting(string memory _greeting) public {
    IBridge bridge = inbox.bridge();

    // this prevents reentrancies on L2 to L1 txs
    require(msg.sender == address(bridge), 'NOT_BRIDGE');

    IOutbox outbox = IOutbox(bridge.activeOutbox());
    address l2Sender = outbox.l2ToL1Sender();
    require(l2Sender == l2Target, 'Greeting only updateable by L2');

    greeting = _greeting;
  }

  /// Sets the greeting message in the counterpart contract (on L2)
  function setGreetingInL2(
    string memory _greeting,
    uint256 maxSubmissionCost,
    uint256 maxGas,
    uint256 gasPriceBid
  ) public payable returns (uint256) {
    bytes memory data = abi.encodeWithSelector(this.setGreeting.selector, _greeting);
    uint256 ticketID = inbox.createRetryableTicket{ value: msg.value }(
      l2Target,
      0,
      maxSubmissionCost,
      msg.sender,
      msg.sender,
      maxGas,
      gasPriceBid,
      data
    );

    emit RetryableTicketCreated(ticketID);
    return ticketID;
  }
}
