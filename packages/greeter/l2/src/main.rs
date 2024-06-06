//! Greeter contract (L2 side)
//! This is part of a set of contracts deployed in 2 connected layers,
//! that update their values using cross-chain messages
//!
//! This file is used to export the ABI of the contract
#[cfg(feature = "export-abi")]
fn main() {
    stylus_greeter_l2::print_abi("MIT-OR-APACHE-2.0", "pragma solidity ^0.8.23;");
}
