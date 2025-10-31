#!/bin/bash

# Stop script on error
set -e

# Load environment variables from the appropriate file
ENV_FILE=".env.mainnet"

if [ -f "$ENV_FILE" ]; then
  echo "Loading environment variables from $ENV_FILE..."
  export $(grep -v '^#' "$ENV_FILE" | xargs)
else
  echo "Environment file $ENV_FILE not found!"
  exit 1
fi

# Define a cleanup function to clear environment variables
cleanup_env() {
  echo "Cleaning up environment variables..."
  unset STARKNET_RPC_URL
  unset DOJO_ACCOUNT_ADDRESS
  unset DOJO_PRIVATE_KEY
  echo "Environment variables cleared."
}

# Set the trap to execute cleanup on script exit or error
trap cleanup_env EXIT

# Build the project
echo "Building the project..."
sozo -P mainnet build

# Deploy the project
echo "Deploying to Mainnet..."
sozo -P mainnet migrate

# Extract world address and update dojo_mainnet.toml
WORLD_ADDRESS=$(sozo -P mainnet migrate 2>&1 | grep "World deployed at" | awk '{print $NF}')
if [ ! -z "$WORLD_ADDRESS" ]; then
    echo "Updating world address in dojo_mainnet.toml..."
    sed -i "s/# world_address = \"\"/world_address = \"$WORLD_ADDRESS\"/" dojo_mainnet.toml
fi

# Verify contracts with Walnut
echo "Verifying contracts with Walnut..."
sozo walnut verify || echo "Walnut verification started - check the provided link"

# Deployment succeeded message
echo "Deployment completed successfully."
echo "World Address: $WORLD_ADDRESS"