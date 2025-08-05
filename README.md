# Agent Funding Subgraph

A comprehensive blockchain indexing system that tracks and analyzes DeFi activities of autonomous agents (Optimus agents) on the Optimism network.

**🔗 Subgraph URL**: https://api.studio.thegraph.com/query/96360/agent-funding/version/latest

## Overview

This subgraph provides real-time tracking and analytics for AI agents operating in DeFi protocols, including funding flows, position management, portfolio performance, and OLAS staking rewards.

## Quick Start

### Basic Agent Query
```graphql
{
  service(id: "0x9f3abfc3301093f39c2a137f87c525b4a0832ba9") {
    serviceId
    isActive
    operatorSafe
  }
  
  agentPortfolio(id: "0x9f3abfc3301093f39c2a137f87c525b4a0832ba9") {
    finalValue
    roi
    apr
    totalPositions
  }
}
```

### Get All Active Agents
```graphql
{
  services(where: { isActive: true }) {
    id
    serviceId
    operatorSafe
  }
}
```

## What This Subgraph Tracks

- 🤖 **Agent Registration**: Service discovery from ServiceRegistryL2
- 💰 **Funding Flows**: USDC deposits/withdrawals to agent safes
- 🏦 **DeFi Positions**: Uniswap V3, Velodrome CL, Velodrome V2
- 🎁 **OLAS Rewards**: Staking rewards from OLAS protocol
- 📊 **Portfolio Metrics**: ROI, APR, performance analytics
- 💲 **Price Discovery**: Multi-source USD pricing (Chainlink, DEX pools)

## Core Entities

### Main Entities
- **🔧 Service** - Central agent entity with safe addresses and metadata
- **💵 FundingBalance** - Tracks USDC deposits/withdrawals (handles re-funding bug)
- **🎯 ProtocolPosition** - Individual DeFi positions across protocols
- **📈 AgentPortfolio** - Portfolio metrics (ROI, APR, total value)
- **🏦 TokenBalance** - Token holdings in agent safes
- **🎁 OlasRewards** - OLAS staking rewards tracking

### Supporting Entities
- **📝 ServiceRegistration** - Agent registration events
- **🔗 ServiceIndex** - Service ID to safe address mapping
- **🏠 AddressType** - EOA vs Contract address caching
- **💲 PriceSource** - Price oracle sources and confidence
- **🪙 Token** - Token metadata and USD pricing
- **📊 PriceUpdate** - Historical price records
- **📸 AgentPortfolioSnapshot** - Portfolio snapshots for trends

> **📖 For detailed entity schemas and field descriptions, see [Technical Documentation](docs/technical-documentation.md)**

## Sample Queries

### 📋 Get Complete Agent Data
```graphql
{
  service(id: "0x9f3abfc3301093f39c2a137f87c525b4a0832ba9") {
    serviceId
    isActive
    operatorSafe
    balances {
      symbol
      balance
      balanceUSD
    }
  }
  
  fundingBalance(id: "0x9f3abfc3301093f39c2a137f87c525b4a0832ba9") {
    totalInUsd
    totalOutUsd
    netUsd
    firstInTimestamp
  }
  
  agentPortfolio(id: "0x9f3abfc3301093f39c2a137f87c525b4a0832ba9") {
    initialValue
    finalValue
    positionsValue
    uninvestedValue
    olasRewardsValue
    roi
    apr
    totalPositions
  }
}
```

### 🎯 Get All Active Positions for an Agent
```graphql
{
  protocolPositions(where: { 
    agent: "0x9f3abfc3301093f39c2a137f87c525b4a0832ba9",
    isActive: true 
  }) {
    id
    protocol
    tokenId
    usdCurrent
    token0Symbol
    token1Symbol
    amount0USD
    amount1USD
    entryAmountUSD
  }
}
```

### 📊 Get Portfolio Performance for Multiple Agents
```graphql
{
  agentPortfolios(where: {
    id_in: [
      "0x8ed5ae443fbb1a36e364ac154887f3150669702a",
      "0xe4eaf37b1726634935f679a8f3e00ec2e4e650a0",
      "0x9f3abfc3301093f39c2a137f87c525b4a0832ba9"
    ]
  }) {
    id
    initialValue
    finalValue
    roi
    apr
    totalPositions
    lastUpdated
  }
}
```

### 🎁 Get OLAS Rewards for an Agent
```graphql
{
  olasRewards(id: "0x9f3abfc3301093f39c2a137f87c525b4a0832ba9") {
    currentOlasStaked
    olasRewardsEarned
    olasRewardsEarnedUSD
    lastRewardTimestamp
    averageOlasPrice
  }
}
```

### 🔍 Get All Services Overview
```graphql
{
  services(where: { isActive: true }) {
    id
    serviceId
    operatorSafe
    serviceSafe
    positionIds
  }
}
```

### 💰 Get Funding Overview for All Agents
```graphql
{
  fundingBalances(orderBy: netUsd, orderDirection: desc) {
    id
    totalInUsd
    totalOutUsd
    netUsd
    firstInTimestamp
  }
}
```

## Key Features

- ⚡ **Real-time Tracking**: Portfolio values update with every blockchain transaction
- 🔗 **Multi-Protocol Support**: Tracks positions across Uniswap V3, Velodrome CL, and Velodrome V2
- 📈 **Comprehensive Analytics**: ROI, APR, and performance metrics calculated automatically
- 🎁 **OLAS Integration**: Includes staking rewards in portfolio calculations
- 💲 **Price Discovery**: Uses Chainlink oracles and DEX pools for accurate USD valuations
- 📸 **Historical Data**: Portfolio snapshots for trend analysis
- 🚀 **Production Ready**: Currently tracking live Optimus agents on Optimism

## Usage Notes

- All addresses should be lowercase in queries
- Use `fundingBalance` as a separate entity, not a field on Service
- The `agent` field on ProtocolPosition is an address, not a relation
- Portfolio metrics are automatically recalculated on every position or funding change
- OLAS rewards are included in the total portfolio value calculations

## Architecture

```
Service Registry → Service Discovery → Agent Tracking
     ↓
USDC Transfers → Funding Tracking → Portfolio Updates
     ↓
DeFi Protocols → Position Tracking → Real-time Valuation
     ↓
OLAS Staking → Rewards Tracking → Portfolio Integration
     ↓
Price Oracles → USD Conversion → Analytics & Metrics
```

## Supported Protocols

| Protocol | Type | Features |
|----------|------|----------|
| Uniswap V3 | Concentrated Liquidity | NFT positions, fee collection, liquidity management |
| Velodrome CL | Concentrated Liquidity | NFT positions, fee collection, liquidity management |
| Velodrome V2 | AMM | LP tokens, pool shares, rewards |
| OLAS Staking | Rewards | Staking rewards, USD conversion |

## Getting Started

1. **Access the Subgraph**: Use the GraphQL endpoint above
2. **Explore Entities**: Start with `services` to see all tracked agents
3. **Check Funding**: Query `fundingBalances` for investment flows
4. **Analyze Positions**: Use `protocolPositions` for DeFi activities
5. **Review Performance**: Query `agentPortfolios` for metrics

## Subgraph Access

**GraphQL Endpoint**: https://api.studio.thegraph.com/query/96360/agent-funding/version/latest

You can use this endpoint with any GraphQL client or directly in the Graph Explorer to query agent data, portfolio metrics, and DeFi positions.

---

*Built with The Graph Protocol for tracking autonomous agent DeFi activities on Optimism*
