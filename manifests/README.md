# Deployment Manifests

This directory contains historical deployment manifests for the Survivor Valhalla contracts.

## Structure

```
manifests/
├── mainnet/     # Production mainnet deployments
├── sepolia/     # Testnet deployments
└── dev/         # Local development deployments
```

## Manifest Files

Each deployment creates a timestamped manifest file containing:
- World contract address
- All deployed contract addresses
- Contract ABIs
- Event and model registrations

## File Naming Convention

`manifest_<network>_<timestamp>.json`

Example: `manifest_mainnet_2024-11-01_143022.json`

## Usage

The latest manifest for each network can be found by checking the most recent timestamp.