# GitHub Secrets Setup for Automated Deployment

This document explains how to set up GitHub secrets for automated deployment to Starknet mainnet.

## Required GitHub Secrets

You need to configure the following secrets in your GitHub repository:

### 1. `STARKNET_RPC_URL_MAINNET`
- **Description**: Your Starknet mainnet RPC provider URL
- **Example**: `https://api.cartridge.gg/x/starknet/mainnet`
- **How to get**: Sign up at [Cartridge](https://cartridge.gg) to get a free RPC endpoint

### 2. `DOJO_ACCOUNT_ADDRESS`
- **Description**: Your Starknet account address that will deploy the contracts
- **Example**: `0x1234567890abcdef...`
- **Requirements**: 
  - Must be a deployed account on mainnet
  - Must have ETH for gas fees (0.001 ETH should be sufficient)

### 3. `DOJO_PRIVATE_KEY`
- **Description**: Private key of your Starknet account
- **Format**: Hexadecimal string without 0x prefix
- **Security**: ⚠️ **NEVER commit this to your repository!**

### 4. `SLOT_AUTH_TOKEN`
- **Description**: Authentication token for Slot CLI to deploy Torii indexer
- **How to get**:
  1. Install Slot CLI: `curl -L https://slot.cartridge.sh/install | bash`
  2. Login: `slot auth login`
  3. Generate token: `slot auth token`
  4. Copy the token output

## How to Add Secrets to GitHub

1. Go to your GitHub repository
2. Click on **Settings** → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add each secret with its name and value

## Local Development Setup

For local deployment, create a `.env.mainnet` file in the `contract` directory:

```bash
# contract/.env.mainnet
export STARKNET_RPC_URL=<YOUR_RPC_URL>
export DOJO_ACCOUNT_ADDRESS=<YOUR_ACCOUNT_ADDRESS>
export DOJO_PRIVATE_KEY=<YOUR_PRIVATE_KEY>
```

⚠️ **Important**: Add `.env.mainnet` to your `.gitignore` file!

## Deployment Process

The GitHub Action will:
1. Build the contracts using `sozo`
2. Deploy to Starknet mainnet
3. Extract the world address
4. Deploy a Torii indexer using Slot
5. Verify contracts with Walnut

### Manual Deployment

To deploy manually:
```bash
cd contract
./scripts/deploy_mainnet.sh
```

## Monitoring Deployment

1. Check GitHub Actions tab for deployment status
2. Download the deployment artifacts for Torii endpoints
3. Use Walnut to debug transactions: https://app.walnut.dev

## Troubleshooting

### RPC Connection Issues
- Verify your RPC URL is correct
- Check if the RPC provider is for mainnet (not testnet)

### Account Issues
- Ensure account has sufficient ETH
- Verify account is deployed on mainnet
- Check that the private key matches the account address

### Slot Authentication
- Token might expire - regenerate with `slot auth token`
- Ensure you're logged in before generating token

## Security Best Practices

1. **Never commit sensitive data** to your repository
2. **Use dedicated deployment accounts** with limited funds
3. **Rotate keys regularly** if possible
4. **Monitor account activity** for unauthorized use
5. **Use GitHub environment protection rules** for production deployments