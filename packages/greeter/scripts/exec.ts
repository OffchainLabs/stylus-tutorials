import fs from 'fs';
import { ethers, providers, Wallet } from 'ethers';
import { BigNumber } from '@ethersproject/bignumber';
import {
  L1TransactionReceipt,
  L1ToL2MessageStatus,
  EthBridger,
  getL2Network,
  addDefaultLocalNetwork,
} from '@arbitrum/sdk';
import { getBaseFee } from '@arbitrum/sdk/dist/lib/utils/lib';
import { L1ToL2MessageGasEstimator } from '@arbitrum/sdk/dist/lib/message/L1ToL2MessageGasEstimator';
import { requireEnvVariables, arbLog, arbLogTitle } from '../../stylus-tutorials-utils';

// Check env variables
requireEnvVariables(['PRIVATE_KEY', 'L2RPC', 'L1RPC']);

// Instantiate L1 / L2 wallets connected to providers
const l1Provider = new providers.JsonRpcProvider(process.env.L1RPC);
const l2Provider = new providers.JsonRpcProvider(process.env.L2RPC);
const l1Wallet = new Wallet(process.env.PRIVATE_KEY!, l1Provider);
const l2Wallet = new Wallet(process.env.PRIVATE_KEY!, l2Provider);

// Load compilation objects of contracts
if (!fs.existsSync('./l1/out/GreeterL1.sol/GreeterL1.json')) {
  throw new Error('You must compile the L1 contract before executing this script');
}
import l1GreeterJson from '../l1/out/GreeterL1.sol/GreeterL1.json';
if (!fs.existsSync('./l2/out/deployment_tx_data') || !fs.existsSync('./l2/out/abi')) {
  throw new Error('You must compile the L2 contract before executing this script');
}
const l2GreeterBytecode = fs.readFileSync('./l2/out/deployment_tx_data');
const l2GreeterExportedAbi = fs.readFileSync('./l2/out/abi', 'utf-8');

// Main function
const main = async () => {
  arbLog('Cross-chain Greeter');

  // Add the default local network configuration to the SDK to allow this script to run on a local node
  addDefaultLocalNetwork();

  // Use l2Network to create an Arbitrum SDK EthBridger instance
  // (we'll use EthBridger to retrieve the Inbox address)
  const l2Network = await getL2Network(l2Provider);
  const ethBridger = new EthBridger(l2Network);
  const inboxAddress = ethBridger.l2Network.ethBridge.inbox;

  //
  // Deployment of contracts
  //
  arbLogTitle('Deploy contracts');

  // Deploying the L1 Greeter to L1
  // (Note that this is a Foundry project which must be compiled prior to executing this script)
  const l1GreeterContractFactory = new ethers.ContractFactory(
    l1GreeterJson.abi,
    l1GreeterJson.bytecode,
    l1Wallet,
  );
  const l1Greeter = await l1GreeterContractFactory.deploy(
    'Hello world in L1',
    ethers.constants.AddressZero,
    inboxAddress,
  );
  await l1Greeter.deployed();
  console.log(`L1 Greeter deployed to ${l1Greeter.address}`);

  // Deploying the L2 Greeter to L2 with a different "greeting" message
  // (Note that this is a Stylus project which must be compiled prior to executing this script)
  const l2GreeterAbi = l2GreeterExportedAbi
    .split(/\r?\n/)
    .filter(
      (line) =>
        line.trim().startsWith('function') ||
        line.trim().startsWith('constructor') ||
        line.trim().startsWith('event'),
    )
    .map((line) => line.trim().replace(';', ''));
  const l2GreeterContractFactory = new ethers.ContractFactory(
    l2GreeterAbi,
    l2GreeterBytecode,
    l2Wallet,
  );
  const l2Greeter = await l2GreeterContractFactory.deploy();
  await l2Greeter.deployed();
  console.log(`L2 Greeter deployed to ${l2Greeter.address}`);

  // Activating L2 contract
  // (if the same bytecode has been activated before, there's no need to activate it again)
  try {
    const arbWasm = new ethers.Contract(
      '0x0000000000000000000000000000000000000071',
      ['function activateProgram(address)'],
      l2Provider,
    ).connect(l2Wallet);
    const activateStylusProgramTx = await arbWasm.activateProgram(l2Greeter.address);
    await activateStylusProgramTx.wait();
    console.log('L2 Greeter program succesfully activated');
  } catch (error) {
    console.log('L2 Greeter program is already activated');
  }

  // Updating the L1 greeter
  const updateL1Tx = await l1Greeter.updateL2Target(l2Greeter.address);
  await updateL1Tx.wait();

  // Updating the L2 greeter
  const updateL2Tx = await l2Greeter.updateL1Target(l1Greeter.address);
  await updateL2Tx.wait();
  console.log('Counterpart contract addresses set in both greeters');

  //
  // Setting a new L2 greeting, by sending it from L1
  //
  arbLogTitle('Setting a new L2 greeting, by sending it from L1');

  // Logging the L2 greeting message
  const currentL2Greeting = await l2Greeter.greet();
  console.log(`Current L2 greeting: "${currentL2Greeting}"`);

  // New greeting message
  const newGreeting = 'Greeting from far, far away';

  // Querying the required gas params using the estimateAll method in Arbitrum SDK
  const l1ToL2MessageGasEstimate = new L1ToL2MessageGasEstimator(l2Provider);

  // To be able to estimate the gas related params to our L1-L2 message, we need to know how many bytes of calldata out retryable ticket will require
  // i.e., we need to calculate the calldata for the function being called (setGreeting())
  const ABI = ['function setGreeting(string _greeting)'];
  const iface = new ethers.utils.Interface(ABI);
  const calldata = iface.encodeFunctionData('setGreeting', [newGreeting]);

  // Users can override the estimated gas params when sending an L1-L2 message
  const RetryablesGasOverrides = {
    gasLimit: {
      base: undefined, // when undefined, the value will be estimated from rpc
      min: BigNumber.from(10000), // set a minimum gas limit, using 10000 as an example
      percentIncrease: BigNumber.from(30), // how much to increase the base for buffer
    },
    maxSubmissionFee: {
      base: undefined,
      percentIncrease: BigNumber.from(30),
    },
    maxFeePerGas: {
      base: undefined,
      percentIncrease: BigNumber.from(30),
    },
  };

  // The estimateAll method gives us the following values for sending an L1->L2 message
  // (1) maxSubmissionCost: The maximum cost to be paid for submitting the transaction
  // (2) gasLimit: The L2 gas limit
  // (3) deposit: The total amount to deposit on L1 to cover L2 gas and L2 call value
  const L1ToL2MessageGasParams = await l1ToL2MessageGasEstimate.estimateAll(
    {
      from: l1Greeter.address,
      to: l2Greeter.address,
      l2CallValue: BigNumber.from(0),
      excessFeeRefundAddress: l2Wallet.address,
      callValueRefundAddress: l2Wallet.address,
      data: calldata,
    },
    await getBaseFee(l1Provider),
    l1Provider,
    RetryablesGasOverrides, // if provided, it will override the estimated values. Note that providing "RetryablesGasOverrides" is totally optional.
  );
  console.log(
    `Current retryable base submission price is: ${L1ToL2MessageGasParams.maxSubmissionCost.toString()}`,
  );

  // For the L2 gas price, we simply query it from the L2 provider, as we would when using L1
  const gasPriceBid = await l2Provider.getGasPrice();
  console.log(`L2 gas price: ${gasPriceBid.toString()}`);

  console.log(
    `Sending greeting to L2 with ${L1ToL2MessageGasParams.deposit.toString()} callValue for L2 fees`,
  );
  const setGreetingTx = await l1Greeter.setGreetingInL2(
    newGreeting, // string memory _greeting,
    L1ToL2MessageGasParams.maxSubmissionCost,
    L1ToL2MessageGasParams.gasLimit,
    gasPriceBid,
    {
      value: L1ToL2MessageGasParams.deposit,
    },
  );
  const setGreetingRec = await setGreetingTx.wait();

  console.log(`Greeting txn confirmed on L1: ${setGreetingRec.transactionHash}`);

  const l1TxReceipt = new L1TransactionReceipt(setGreetingRec);

  // Check if the L1 to L2 message is redeemed on L2
  const messages = await l1TxReceipt.getL1ToL2Messages(l2Wallet);
  const message = messages[0];
  console.log(
    'Waiting for the L2 execution of the transaction. This may take up to 10-15 minutes.',
  );
  const messageResult = await message.waitForStatus();
  const status = messageResult.status;
  if (status === L1ToL2MessageStatus.REDEEMED) {
    console.log(`L2 retryable ticket is executed: ${messageResult.l2TxReceipt.transactionHash}`);
  } else {
    console.log(`L2 retryable ticket failed with status ${L1ToL2MessageStatus[status]}`);
  }

  // Note that during L2 execution, a retryable's sender address is transformed to its L2 alias.
  // Thus, when GreeterL2 checks that the message came from the L1, we check that the sender is this L2 Alias.
  // See setGreeting in the GreeterL2 contract for this check.

  // Checking the L2 greeting again
  const newGreetingL2 = await l2Greeter.greet();
  console.log(`Updated L2 greeting: "${newGreetingL2}"`);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
