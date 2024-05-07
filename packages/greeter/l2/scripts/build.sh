#!/bin/bash

# ------------- #
# Configuration #
# ------------- #

# Load variables from .env file
set -o allexport
source ../../../.env
source ../.env
set +o allexport

if [ -z "$PRIVATE_KEY" ] || [ -z "$L2RPC" ]
then
    echo "You need to provide the PRIVATE_KEY of the deployer and the L2RPC"
    exit 0
fi

# Prepare transactions data
mkdir -p out
cargo stylus deploy -e $L2RPC --private-key $PRIVATE_KEY --dry-run --output-tx-data-to-dir out

# Generate ABI
cargo stylus export-abi > out/abi