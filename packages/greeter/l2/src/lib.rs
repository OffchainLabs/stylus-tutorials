//! Greeter contract (L2 side)
//! This is part of a set of contracts deployed in 2 connected layers,
//! that update their values using cross-chain messages

// Only run this as a WASM if the export-abi feature is not set.
#![cfg_attr(not(feature = "export-abi"), no_main)]
extern crate alloc;

#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

// Dependencies
use sha3::{Digest, Keccak256};
use alloy_primitives::{address, Address, U256, U160};
use alloy_sol_types::{sol};
use stylus_sdk::{
  msg,
  evm,
  prelude::*,
  storage::StorageString,
  storage::StorageAddress,
  call::Call,
  call::Error
};

// Interface of the ArbSys precompile
sol_interface! {
  interface ArbSys {
    function sendTxToL1(address destination, bytes calldata data) external payable returns (uint256);
  }
}

// ArbSys precompile address
const ARBSYS_ADDRESS: Address = address!("0000000000000000000000000000000000000064");

// Declare events
sol! {
  event L2ToL1TxCreated(uint256 indexed withdrawalId);
}

// Storage layout
#[solidity_storage]
#[entrypoint]
pub struct GreeterL2 {
  /// Greeting message
  greeting: StorageString,

  /// Address of the counterpart contract (on L1)
  l1_target: StorageAddress,
}

#[external]
impl GreeterL2 {
  pub fn get_l1_target(&self) -> Result<Address, Vec<u8>> {
    Ok(self.l1_target.get())
  }
  
  pub fn update_l1_target(&mut self, l1_target: Address) -> Result<(), Vec<u8>> {
    self.l1_target.set(l1_target);
    Ok(())
  }
  
  pub fn greet(&self) -> Result<String, Vec<u8>> {
    Ok(self.greeting.get_string())
  }

  /// Only l1_target can update the greeting message
  pub fn set_greeting(&mut self, greeting: String) -> Result<(), Vec<u8>> {
    // Calculate alias of L1 target
    let l1_target_address = U160::try_from(self.l1_target.get()).unwrap();
    let offset = U160::from_str_radix("1111000000000000000000000000000000001111", 16).unwrap();
    let l1_target_alias = Address::from(l1_target_address + offset);

    if msg::sender() != l1_target_alias {
      return Err("Greeting only updateable by L1".as_bytes().to_vec());
    }

    self.greeting.set_str(greeting);
    Ok(())
  }

  /// Sets the greeting message in the counterpart contract (on L1)
  pub fn set_greeting_in_l1(&self, greeting: String) -> Result<U256, Vec<u8>> {
    // Prepare calldata
    let mut hasher = Keccak256::new();
    hasher.update("setGreeting(string)".as_bytes());
    let hashed_function_selector = hasher.finalize();
    let data = [&hashed_function_selector[..4], &greeting.as_bytes()].concat();

    // Make the call to ArbSys
    let arbsys = ArbSys::new(ARBSYS_ADDRESS);
    let config = Call::new();
    let withdrawal_id = arbsys
      .send_tx_to_l_1(config, self.l1_target.get(), data)
      .map_err(|_e| Error::Revert("External call failed".as_bytes().to_vec()))?;
    
    // Emit the log
    evm::log(L2ToL1TxCreated { withdrawalId: withdrawal_id });

    Ok(withdrawal_id)
  }
}
