# Agent Funding Subgraph

A Graph Protocol subgraph for tracking agent funding activities on blockchain networks. This subgraph indexes Safe wallet transactions, ERC20 token transfers, and price feed data to provide comprehensive analytics for agent funding operations.

## Overview

This subgraph monitors:
- Safe wallet transactions and executions
- ERC20 token transfers (USDC Native and Bridged)
- Price feed updates from Chainlink aggregators
- Funding events and agent activities

## Features

- **Safe Wallet Tracking**: Monitor Safe wallet creations, transactions, and executions
- **Token Transfer Monitoring**: Track ERC20 token movements for funding analysis
- **Price Feed Integration**: Real-time price data from Chainlink oracles
- **Agent Funding Analytics**: Comprehensive data for agent funding patterns

## Schema

The subgraph defines the following main entities:
- `Safe`: Safe wallet information and metadata
- `Transaction`: Safe transaction details
- `TokenTransfer`: ERC20 token transfer events
- `PriceFeed`: Price data from oracles
- `Agent`: Agent-specific funding information

## Deployment

### Prerequisites

- Node.js (v16 or higher)
- Yarn package manager
- Graph CLI

### Installation

```bash
# Install dependencies
yarn install

# Generate types
yarn codegen

# Build the subgraph
yarn build
```

### Local Deployment

```bash
# Create local subgraph
yarn create-local

# Deploy to local Graph Node
yarn deploy-local
```

### Studio Deployment

```bash
# Deploy to Graph Studio
yarn deploy
```

## Configuration

The subgraph is configured in `subgraph.yaml` with:
- Network: Base (can be configured for other networks)
- Contract addresses for Safe, USDC tokens, and price feeds
- Event handlers for monitoring blockchain events

## Development

### File Structure

```
├── abis/                   # Contract ABIs
├── src/                    # TypeScript source files
│   ├── common.ts          # Common utilities
│   ├── funding.ts         # Funding event handlers
│   ├── helpers.ts         # Helper functions
│   └── safe.ts            # Safe wallet handlers
├── schema.graphql         # GraphQL schema definition
├── subgraph.yaml          # Subgraph configuration
└── package.json           # Dependencies and scripts
```

### Adding New Event Handlers

1. Update the GraphQL schema in `schema.graphql`
2. Add event handlers in the appropriate TypeScript files
3. Update `subgraph.yaml` to include new data sources
4. Run `yarn codegen` to generate types
5. Build and deploy

## Queries

Example queries you can run against this subgraph:

### Get Safe Wallets
```graphql
{
  safes(first: 10) {
    id
    address
    owners
    threshold
    createdAt
  }
}
```

### Get Token Transfers
```graphql
{
  tokenTransfers(first: 10, orderBy: timestamp, orderDirection: desc) {
    id
    from
    to
    amount
    token
    timestamp
  }
}
```

### Get Price Feed Data
```graphql
{
  priceFeeds(first: 5) {
    id
    price
    timestamp
    aggregator
  }
}
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under UNLICENSED.

## Support

For questions or support, please open an issue in the GitHub repository.
