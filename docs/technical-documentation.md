# Agent Funding Subgraph - Technical Documentation

## Table of Contents
1. [How are Services Tracked](#1-how-are-services-tracked)
2. [How are Protocol Positions Indexed and When Updated](#2-how-are-protocol-positions-indexed-and-when-updated)
3. [How are Initial Funding Calculated (Funding Balances)](#3-how-are-initial-funding-calculated-funding-balances)
4. [How are Final Values Calculated (plus OLAS Rewards)](#4-how-are-final-values-calculated-plus-olas-rewards)
5. [How is Portfolio Calculated (APR, ROI, etc) and Tracked](#5-how-is-portfolio-calculated-apr-roi-etc-and-tracked)
6. [How are Prices of Tokens Determined](#6-how-are-prices-of-tokens-determined)
7. [Code References](#7-code-references)

---

## 1. How are Services Tracked

**Purpose**: Discovers and tracks Optimus agent registrations and multisig deployments.  
**Contract**: `0x3d77596beb0f130a4415df3D2D8232B3d3D31e44` (ServiceRegistryL2)  
**GitHub**: [`src/serviceRegistry.ts`](../src/serviceRegistry.ts)

### Events Tracked

#### `RegisterInstance(indexed uint256,indexed address)`
**What it does**: Emitted when agents register with the service registry.  
**Our logic**: We filter for Agent ID 40 (Optimus agents only) and create a `ServiceRegistration` entity that links the operator safe address to the service ID for future reference.

#### `CreateMultisigWithAgents(indexed uint256,indexed address)`
**What it does**: Emitted when multisig safes are deployed for registered services.  
**Our logic**: We create the main `Service` entity with the multisig safe address, mark any previous services as inactive, and create a Safe datasource to track ETH transfers for this agent.

### Service Discovery Flow
1. **Agent Registration** → `ServiceRegistration` entity created with operator-to-serviceId mapping
2. **Multisig Deployment** → `Service` entity created with safe address, previous services marked inactive
3. **Safe Datasource Creation** → ETH transfers tracked, service becomes active
4. **Ready for Tracking** → Service can now have positions and funding tracked

---

## 2. How are Protocol Positions Indexed and When Updated

### Uniswap V3 Concentrated Liquidity

**Contract**: `0xC36442b4a4522E871399CD717aBDD847Ab11FE88` (NFT Manager)  
**GitHub**: [`src/uniV3NFTManager.ts`](../src/uniV3NFTManager.ts), [`src/uniV3Shared.ts`](../src/uniV3Shared.ts)

#### Events Tracked

**`IncreaseLiquidity(indexed uint256,uint128,uint256,uint256)`**  
**What it does**: Emitted when liquidity is added to existing positions or new positions are created.  
**Our logic**: We create new `ProtocolPosition` entities or update existing ones, using the actual event amounts for accurate entry tracking rather than calculated amounts. Position values are then updated using liquidity math.

**`DecreaseLiquidity(indexed uint256,uint128,uint256,uint256)`**  
**What it does**: Emitted when liquidity is removed from positions.  
**Our logic**: We reduce the position's liquidity amount and recalculate current position values using the pool's current state and tick math.

**`Collect(indexed uint256,address,uint256,uint256)`**  
**What it does**: Emitted when fees are collected from positions.  
**Our logic**: We update the position state without affecting liquidity but trigger a value recalculation to reflect any price changes since the last update.

**`Transfer(indexed address,indexed address,indexed uint256)`**  
**What it does**: Emitted when NFT ownership changes between addresses.  
**Our logic**: We mark positions as closed when transferred out of agent safes and update our position cache to stop tracking swaps for transferred positions.

#### Position Value Calculation
```typescript
// From uniV3Shared.ts - Uses Uniswap V3 liquidity math
const amounts = LiquidityAmounts.getAmountsForLiquidity(
  slot0.value0, sqrtPa, sqrtPb, data.value7
)
const usd0 = amount0Human.times(token0Price)
const usd1 = amount1Human.times(token1Price)
const totalUSD = usd0.plus(usd1)
```

### Velodrome CL Concentrated Liquidity

**Contract**: `0x416b433906b1B72FA758e166e239c43d68dC6F29` (NFT Manager)  
**GitHub**: [`src/veloNFTManager.ts`](../src/veloNFTManager.ts), [`src/veloCLShared.ts`](../src/veloCLShared.ts)

#### Events Tracked
**Same events as Uniswap V3** with Velodrome-specific differences:
- **Pool Identification**: Uses tick spacing instead of fee tiers to identify pools
- **Pool Derivation**: Different factory contract and pool creation logic via VelodromeCLFactory
- **Token Mapping**: Velodrome-specific hardcoded token symbol and decimal mappings

#### Position Value Calculation
```typescript
// From veloCLShared.ts - Same liquidity math as Uniswap V3
const amounts = LiquidityAmounts.getAmountsForLiquidity(
  slot0.value0, sqrtPa, sqrtPb, data.value7
)
// Uses Velodrome-specific token symbol mapping
const usd = amount0Human.times(token0Price).plus(amount1Human.times(token1Price))
```

### Velodrome V2 AMM Pools

**GitHub**: [`src/veloV2Pool.ts`](../src/veloV2Pool.ts), [`src/veloV2Shared.ts`](../src/veloV2Shared.ts)

#### Events Tracked

**`Mint(indexed address,uint256,uint256)`**  
**What it does**: Emitted when LP tokens are minted (liquidity is added to AMM pools).  
**Our logic**: We create new AMM position entities, calculate the LP token amounts based on pool reserves, and determine the agent's share of the total pool.

**`Burn(indexed address,indexed address,uint256,uint256)`**  
**What it does**: Emitted when LP tokens are burned (liquidity is removed from AMM pools).  
**Our logic**: We remove liquidity from the AMM position and update position values based on the remaining LP token share and current pool reserves.

**`Sync(uint256,uint256)`**  
**What it does**: Emitted after swaps to update pool reserves to match actual token balances.  
**Our logic**: We trigger position value recalculation for all tracked positions in this pool to ensure accurate pricing based on updated reserves.

**`Transfer(indexed address,indexed address,uint256)`**  
**What it does**: Emitted when LP tokens are transferred between addresses.  
**Our logic**: We update position ownership and recalculate values when LP tokens move in or out of tracked agent safes.

#### Position Value Calculation
```typescript
// From veloV2Shared.ts - AMM pool share calculation
const totalSupply = pool.totalSupply()
const reserves = pool.getReserves()
const share = lpBalance.div(totalSupply)
const amount0 = reserves.reserve0.times(share)
const amount1 = reserves.reserve1.times(share)
const totalUSD = amount0.times(token0Price).plus(amount1.times(token1Price))
```

### When Positions are Updated
- **Creation**: When `IncreaseLiquidity` or `Mint` events are first detected for an agent
- **Modification**: When `IncreaseLiquidity`, `DecreaseLiquidity`, `Mint`, or `Burn` events occur
- **Value Updates**: When `Collect`, `Sync`, or swap events occur in tracked pools
- **Closure**: When positions are transferred out of agent safes or liquidity reaches zero

---

## 3. How are Initial Funding Calculated (Funding Balances)

**Purpose**: Tracks USDC funding flows to/from agent safes, accounting for the re-funding bug incident.  
**GitHub**: [`src/funding.ts`](../src/funding.ts), [`src/tokenBalances.ts`](../src/tokenBalances.ts)

### Why Track Incoming - Outgoing?

The funding balance calculates `totalInUsd - totalOutUsd = netUsd` because of the **re-funding bug incident**:

1. **Original Issue**: Agents were accidentally refunded multiple times due to a bug in the funding system
2. **Fix Implementation**: A mechanism was introduced to send back excess funds to operators  
3. **Tracking Requirement**: The subgraph needed to track both directions to calculate true net investment after refunds

### Events Tracked

#### USDC Transfers (Native Only)
**Contract**: 
- USDC Native: `0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85`

**`Transfer(indexed address,indexed address,uint256)`**  
**What it does**: Emitted for all Native USDC transfers on Optimism network.  
**Our logic**: We validate that transfers come from legitimate funding sources (operator addresses or EOA wallets only), then update the `FundingBalance` entity with running totals and trigger portfolio recalculation.

#### ETH Transfers to Agent Safes
**GitHub**: [`src/safe.ts`](../src/safe.ts)

**`SafeReceived(indexed address,uint256)`**  
**What it does**: Emitted when ETH is sent directly to agent safe contracts.  
**Our logic**: We validate the sender is a legitimate funding source (operator or EOA), convert ETH to USD using current ETH price, then update the `FundingBalance` entity and trigger portfolio recalculation.

**`ExecutionSuccess(bytes32,uint256)`**  
**What it does**: Emitted when safe executes transactions, potentially including ETH outflows.  
**Our logic**: Currently logged for monitoring purposes. Future implementation will analyze executed transactions to detect ETH transfers back to operators and update funding balances accordingly.

### Funding Source Validation
```typescript
// From common.ts - Security validation
export function isFundingSource(addr: Address, serviceSafe: Address): boolean {
  let service = getServiceByAgent(serviceSafe)
  let isOperator = addr.equals(service.operatorSafe)
  let isEOA = !ethereum.hasCode(addr).inner  // Prevents contract manipulation
  return isOperator || isEOA
}
```

### Initial Funding Calculation Flow
1. **USDC Transfer Detected** → Validate source is operator or EOA
2. **Incoming Transfer** → `totalInUsd += amount` (legitimate deposits)
3. **Outgoing Transfer** → `totalOutUsd += amount` (refunds back to operators)
4. **Net Calculation** → `netUsd = totalInUsd - totalOutUsd` (true investment after refunds)
5. **Portfolio Trigger** → Recalculate portfolio metrics with new funding baseline

---

## 4. How are Final Values Calculated (plus OLAS Rewards)

**Purpose**: Calculates the total current value of an agent's portfolio including all components.  
**GitHub**: [`src/helpers.ts`](../src/helpers.ts) - `calculatePortfolioMetrics()`

### Final Value Formula
```
Final Value = Positions Value + Uninvested Value + OLAS Rewards Value
```

### Component Breakdown

#### 1. Positions Value
**What it includes**: Sum of all active `ProtocolPosition.usdCurrent` values  
**Calculation**: Each position's current USD value based on real-time token prices and liquidity math  
**Updates when**: Position events occur, swaps happen in tracked pools, or token prices change

#### 2. Uninvested Value  
**What it includes**: Sum of all `TokenBalance.balanceUSD` (tokens held directly in agent safes)  
**Calculation**: Token balances multiplied by current USD prices from our price discovery system  
**Updates when**: ERC20 transfers occur to/from agent safes or token prices change

#### 3. OLAS Rewards Value
**What it includes**: `OlasRewards.olasRewardsEarnedUSD` (cumulative USD value of OLAS staking rewards)  
**Calculation**: Total OLAS tokens earned from staking multiplied by current OLAS price  
**Updates when**: OLAS reward distributions occur or OLAS token price changes

### OLAS Rewards Tracking

**Contract**: `0xa45E64d13A30a51b91ae0eb182e88a40e9b18eD8` (StakingProxy)  
**GitHub**: [`src/olasRewards.ts`](../src/olasRewards.ts)

#### Events Tracked

**`Checkpoint(uint256,uint256,uint256[],uint256[],uint256)`**  
**What it does**: Emitted during reward distribution events across all staked services.  
**Our logic**: We filter for our tracked services, extract their reward amounts from the arrays, update cumulative OLAS rewards, and convert to USD using current OLAS price.

**`ServiceStaked(uint256,indexed uint256,indexed address,indexed address,uint256[])`**  
**What it does**: Emitted when a service begins staking in the OLAS protocol.  
**Our logic**: We initialize OLAS rewards tracking for the service and set up the baseline for future reward calculations.

**`ServiceUnstaked(uint256,indexed uint256,indexed address,indexed address,uint256[],uint256,uint256)`**  
**What it does**: Emitted when a service stops staking and receives final reward distribution.  
**Our logic**: We process the final reward amounts, update cumulative totals, and reset the staked amounts to zero.

### Final Value Update Triggers
- **Position Changes**: Any DeFi position creation, modification, or closure
- **Token Transfers**: Any ERC20 transfer to/from agent safes  
- **OLAS Rewards**: Any OLAS reward distribution or staking status change
- **Price Updates**: When token prices are refreshed (every 5 minutes or on-demand)

---

## 5. How is Portfolio Calculated (APR, ROI, etc) and Tracked

**Purpose**: Calculates performance metrics and tracks portfolio changes over time.  
**GitHub**: [`src/helpers.ts`](../src/helpers.ts) - `calculatePortfolioMetrics()`

### Performance Metrics

#### ROI (Return on Investment)
```
ROI = (Final Value - Initial Value) / Initial Value × 100
```
**Example**: Initial investment $1,000 → Current value $1,200 → ROI = 20%  
**Initial Value**: Comes from `FundingBalance.netUsd` (net USDC funding after refunds)

#### APR (Annualized Percentage Return)
```
APR = ROI × (365 / Days Since First Trade)
```
**Example**: 20% ROI over 30 days → APR = 243.33%  
**First Trade Date**: Set when agent creates their first DeFi position

### Portfolio Calculation Process

```typescript
// From helpers.ts - Portfolio calculation flow
export function calculatePortfolioMetrics(serviceSafe: Address, block: ethereum.Block): void {
  // 1. Load or create AgentPortfolio entity
  // 2. Get initial investment from FundingBalance.netUsd
  // 3. Calculate positions value (sum all active ProtocolPosition.usdCurrent)
  // 4. Calculate uninvested value (sum all TokenBalance.balanceUSD)
  // 5. Get OLAS rewards value from OlasRewards.olasRewardsEarnedUSD
  // 6. Calculate final value (sum all components)
  // 7. Calculate ROI and APR using formulas above
  // 8. Create AgentPortfolioSnapshot for historical tracking
  // 9. Save updated AgentPortfolio entity
}
```

### Portfolio Tracking Features

#### First Trading Timestamp
**Purpose**: Establishes the start date for APR calculations  
**Set when**: Agent creates their first DeFi position (any protocol)  
**Updated via**: `updateFirstTradingTimestamp()` function  
**Critical for**: Accurate time-based performance measurement

#### Portfolio Snapshots
**Entity**: `AgentPortfolioSnapshot` created on every portfolio update  
**Contains**: Timestamp, block number, all portfolio values and metrics  
**Purpose**: Provides historical trend data for performance analysis over time  
**Used for**: Tracking portfolio evolution, identifying performance patterns

### When Portfolio is Calculated and Tracked
1. **Funding Changes** - Any USDC transfer to/from agent safe
2. **Position Changes** - Any DeFi position creation, modification, or closure  
3. **OLAS Rewards** - Any OLAS reward distribution
4. **Token Balance Changes** - Any ERC20 transfer to/from agent safe
5. **Price Updates** - When significant price changes occur for held tokens

---

## 6. How are Prices of Tokens Determined

**Purpose**: Multi-source USD pricing for all whitelisted tokens with confidence-based fallback mechanisms.  
**GitHub**: [`src/priceDiscovery.ts`](../src/priceDiscovery.ts), [`src/tokenConfig.ts`](../src/tokenConfig.ts)

### Price Source Hierarchy
1. **Chainlink Oracles** (Highest Priority - 99% confidence)
2. **DEX Pool Prices** (Fallback - 80-95% confidence)  
3. **Emergency Fallbacks** ($1.00 for critical stablecoins)

### Token-Specific Price Sources

#### USDC Native (`0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85`)
1. **Chainlink USDC/USD**: `0x16a9FA2FDa030272Ce99B29CF780dFA30361E0f3` (99% confidence)
2. **Curve 3Pool**: `0x1337bedc9d22ecbe766df105c9623922a27963ec` (95% confidence)
3. **Uniswap V3 USDC/USDT**: `0xa73c628eaf6e283e26a7b1f8001cf186aa4c0e8e` (90% confidence)

#### WETH (`0x4200000000000000000000000000000000000006`)
1. **Chainlink ETH/USD**: `0x13e3Ee699D1909E989722E753853AE30b17e08c5` (99% confidence)
2. **Uniswap V3 WETH/USDC**: `0x85149247691df622eaf1a8bd0cafd40bc45154a9` (90% confidence)

#### DAI (`0xda10009cbd5d07dd0cecc66161fc93d7c9000da1`)
1. **Chainlink DAI/USD**: `0x8dBa75e83DA73cc766A7e5a0ee71F656BAb470d6` (99% confidence)
2. **Curve 3Pool**: `0x1337bedc9d22ecbe766df105c9623922a27963ec` (95% confidence)

#### USDT (`0x94b008aa00579c1307b0ef2c499ad98a8ce58e58`)
1. **Chainlink USDT/USD**: `0xECef79E109e997bCA29c1c0897ec9d7b03647F5E` (99% confidence)
2. **Curve 3Pool**: `0x1337bedc9d22ecbe766df105c9623922a27963ec` (95% confidence)

#### USDC.e (`0x7f5c764cbc14f9669b88837ca1490cca17c31607`)
1. **Uniswap V3 USDC.e/USDT**: `0xf1f199342687a7d78bcc16fce79fa2665ef870e1` (85% confidence)
2. **Chainlink USDC Reference**: `0x16a9FA2FDa030272Ce99B29CF780dFA30361E0f3` (80% confidence)

#### DOLA (`0x8ae125e8653821e851f12a49f7765db9a9ce7384`)
1. **Velodrome V2 DOLA/USDC**: `0x6c5019d345ec05004a7e7b0623a91a0d9b8d590d` (80% confidence)

#### BOLD (`0x087c440f251ff6cfe62b86dde1be558b95b4bb9b`)
1. **Velodrome V2 BOLD/USDC**: `0xf5ce76b51a4d7f0242bb02b830a73abfa9792157` (85% confidence)
2. **Velodrome V2 BOLD/LUSD**: `0xfe09d5156c4d4ac3b57b192608a8423401bac186` (80% confidence)

#### LUSD (`0xc40f949f8a4e094d1b49a23ea9241d289b7b2819`)
1. **Velodrome V2 USDC/LUSD**: `0x4f3da11c5cadf644ae023dbad01008a934c993e2` (85% confidence)

#### FRAX (`0x2e3d870790dc77a83dd1d18184acc7439a53f475`)
1. **Uniswap V3 FRAX/USDC**: `0x98d9ae198f2018503791d1caf23c6807c135bb6b` (80% confidence)

#### sDAI (`0x2218a117083f5b482b0bb821d27056ba9c04b1d3`)
1. **Velodrome SlipStream USDC/sDAI**: `0x131525f3fa23d65dc2b1eb8b6483a28c43b06916` (80% confidence)

### Price Discovery Process

#### Caching & Validation
- **Cache Duration**: 5 minutes (`PRICE_CACHE_DURATION = 300`)
- **Minimum Confidence**: 50% (`MIN_CONFIDENCE_THRESHOLD = 0.5`)
- **Price Bounds**: $0.0001 - $100,000 (prevents oracle manipulation)
- **Emergency Fallback**: $1.00 for critical stablecoins (USDC, USDT, DAI, LUSD)

#### Price Update Flow
1. **Check Token Whitelist** - Only process configured tokens
2. **Load Cached Price** - Return if recent and confident enough
3. **Try Price Sources** - Attempt sources in priority order
4. **Validate Price** - Check bounds and confidence levels
5. **Update & Record** - Save to Token entity and create PriceUpdate record
6. **Fallback if Needed** - Use emergency $1.00 for critical stablecoins

---

## 7. Code References

### Core Implementation Files
- **Service Discovery**: [`src/serviceRegistry.ts`](../src/serviceRegistry.ts)
- **Funding Tracking**: [`src/funding.ts`](../src/funding.ts)
- **Portfolio Calculations**: [`src/helpers.ts`](../src/helpers.ts)
- **Price Discovery**: [`src/priceDiscovery.ts`](../src/priceDiscovery.ts)
- **Token Configuration**: [`src/tokenConfig.ts`](../src/tokenConfig.ts)
- **Token Balances**: [`src/tokenBalances.ts`](../src/tokenBalances.ts)
- **OLAS Rewards**: [`src/olasRewards.ts`](../src/olasRewards.ts)

### Protocol-Specific Files
- **Uniswap V3**: [`src/uniV3NFTManager.ts`](../src/uniV3NFTManager.ts), [`src/uniV3Shared.ts`](../src/uniV3Shared.ts)
- **Velodrome CL**: [`src/veloNFTManager.ts`](../src/veloNFTManager.ts), [`src/veloCLShared.ts`](../src/veloCLShared.ts)
- **Velodrome V2**: [`src/veloV2Pool.ts`](../src/veloV2Pool.ts), [`src/veloV2Shared.ts`](../src/veloV2Shared.ts)

### Configuration & Schema
- **Subgraph Manifest**: [`subgraph.yaml`](../subgraph.yaml)
- **GraphQL Schema**: [`schema.graphql`](../schema.graphql)
- **Constants**: [`src/constants.ts`](../src/constants.ts)
- **Common Functions**: [`src/common.ts`](../src/common.ts)

### Key Functions by Purpose

#### Portfolio Management
- `calculatePortfolioMetrics()` - Main portfolio calculation engine
- `updateFunding()` - Updates funding balances and triggers portfolio refresh
- `updateFirstTradingTimestamp()` - Sets first trade time for APR calculations

#### Price Discovery
- `getTokenPriceUSD()` - Main price discovery function with caching
- `getPriceFromSources()` - Tries multiple price sources in priority order
- `validatePriceResult()` - Price validation and bounds checking

#### Position Tracking
- `refreshVeloCLPosition()` - Updates Velodrome CL position values
- `refreshVeloCLPositionWithEventAmounts()` - Uses event data for accurate entry tracking
- `ensurePoolTemplate()` - Creates pool datasources for new positions

#### Service Management
- `handleRegisterInstance()` - Processes agent registration events
- `handleCreateMultisigWithAgents()` - Creates service entities and safe tracking
- `findServiceByServiceId()` - Service lookup utilities

This technical documentation provides complete implementation details for understanding how the Agent Funding Subgraph tracks, processes, and analyzes autonomous agent DeFi activities on Optimism.
