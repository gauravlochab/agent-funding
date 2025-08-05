# Agent Funding Subgraph

A comprehensive blockchain indexing system that tracks and analyzes DeFi activities of autonomous agents (Optimus agents) on the Optimism network.

**🔗 Subgraph URL**: https://api.studio.thegraph.com/query/96360/agent-funding/version/latest

## Overview

This subgraph provides real-time tracking and analytics for AI agents operating in DeFi protocols, including funding flows, position management, portfolio performance, and OLAS staking rewards.

## Business Logic

### 🤖 Service Discovery
- Monitors ServiceRegistryL2 contract for new Optimus agent registrations (Agent ID 40)
- Creates service entities when agents are registered and their multisig safes are deployed
- Tracks the lifecycle of agent services (active/inactive status)

### 💰 Funding Tracking
- Monitors USDC transfers (both native and bridged) to/from agent safes
- Validates funding sources (must be from operator addresses or EOA wallets)
- Calculates net funding flows (total deposits - total withdrawals)
- Tracks funding timeline and patterns

### 🏦 Multi-Protocol Position Tracking
- **Uniswap V3**: Concentrated liquidity positions via NFT manager
- **Velodrome CL**: Concentrated liquidity positions via NFT manager  
- **Velodrome V2**: Traditional AMM pool positions
- Real-time position valuation using on-chain price oracles

### 🎯 OLAS Rewards Integration
- Tracks OLAS token rewards from staking activities
- Converts OLAS rewards to USD using price oracles
- Integrates rewards into overall portfolio calculations

### 📊 Portfolio Analytics
- Calculates comprehensive portfolio metrics in real-time
- Computes ROI, APR, and performance indicators
- Tracks uninvested funds (token balances in safes)
- Creates historical snapshots for trend analysis

## Core Entities

### 🔧 Service
**Central entity representing an autonomous agent**
- `id`: Agent's safe address
- `serviceId`: Unique service identifier from registry
- `operatorSafe`: Address of the operator controlling the agent
- `serviceSafe`: Address of the agent's multisig safe
- `isActive`: Whether the service is currently active
- `positionIds`: Array of position IDs for tracking

### 💵 FundingBalance
**Tracks all funding flows for an agent**
- `id`: Agent's safe address
- `totalInUsd`: Total USD deposited to the agent
- `totalOutUsd`: Total USD withdrawn from the agent
- `netUsd`: Net funding (totalIn - totalOut)
- `firstInTimestamp`: When first funding was received
- `lastChangeTs`: Last funding activity timestamp

### 🎯 ProtocolPosition
**Represents individual DeFi positions across protocols**
- `id`: Unique position identifier ("<agent>-<tokenId>")
- `agent`: Agent's safe address
- `protocol`: Protocol name ("uniswap-v3", "velodrome-cl", "velodrome-v2")
- `tokenId`: NFT token ID for the position
- `isActive`: Whether position is currently open
- `usdCurrent`: Current USD value of the position
- `token0Symbol`/`token1Symbol`: Token pair symbols
- `amount0USD`/`amount1USD`: Current USD values of each token
- `entryAmountUSD`: Initial investment amount
- `exitAmountUSD`: Final value when position closed

### 📈 AgentPortfolio
**Aggregated portfolio metrics and performance analysis**
- `id`: Agent's safe address
- `initialValue`: Total initial investment from funding
- `finalValue`: Current total portfolio value
- `positionsValue`: Current value of all active positions
- `uninvestedValue`: Value of tokens held in safe (not in positions)
- `olasRewardsValue`: USD value of OLAS rewards earned
- `roi`: Return on Investment percentage
- `apr`: Annualized Percentage Return
- `totalPositions`: Count of active positions
- `totalClosedPositions`: Count of closed positions

### 🪙 TokenBalance
**Tracks token balances held in agent safes**
- `id`: "<serviceSafe>-<token>"
- `token`: Token contract address
- `symbol`: Token symbol (e.g., "USDC", "DAI")
- `balance`: Token amount held
- `balanceUSD`: USD value of the balance
- `lastUpdated`: Last update timestamp

### 🎁 OlasRewards
**Tracks OLAS staking rewards for agents**
- `id`: Agent's safe address
- `currentOlasStaked`: Current OLAS amount staked
- `olasRewardsEarned`: Total OLAS rewards earned (cumulative)
- `olasRewardsEarnedUSD`: USD value of total rewards
- `lastRewardTimestamp`: Last reward distribution timestamp
- `averageOlasPrice`: Running average OLAS price for USD calculations

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
