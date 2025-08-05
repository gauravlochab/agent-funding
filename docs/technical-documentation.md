# Agent Funding Subgraph - Technical Documentation

## Table of Contents
1. [Event Tracking by Protocol](#event-tracking-by-protocol)
2. [Price Discovery System](#price-discovery-system)
3. [Portfolio Update Triggers](#portfolio-update-triggers)
4. [Funding Balance Logic](#funding-balance-logic)
5. [Portfolio Calculations](#portfolio-calculations)
6. [Performance Metrics](#performance-metrics)
7. [Code References](#code-references)

## Event Tracking by Protocol

### ServiceRegistryL2 (Agent Discovery)
**Contract**: `0x3d77596beb0f130a4415df3D2D8232B3d3D31e44`  
**GitHub**: [`src/serviceRegistry.ts`](../src/serviceRegistry.ts)

#### Events Tracked:
- **`RegisterInstance(indexed uint256,indexed address)`**
  - Filters for Agent ID 40 (Optimus agents only)
  - Creates `ServiceRegistration` entity
  - Links operator safe to service ID

- **`CreateMultisigWithAgents(indexed uint256,indexed address)`**
  - Creates main `Service` entity with multisig safe address
  - Marks previous services as inactive
  - Creates Safe datasource for ETH tracking

### Uniswap V3 NFT Manager
**Contract**: `0xC36442b4a4522E871399CD717aBDD847Ab11FE88`  
**GitHub**: [`src/uniV3NFTManager.ts`](../src/uniV3NFTManager.ts)

#### Events Tracked:
- **`IncreaseLiquidity(indexed uint256,uint128,uint256,uint256)`**
  - Creates new position or adds liquidity to existing
  - Uses event amounts for accurate entry tracking
  - Updates position values using liquidity math

- **`DecreaseLiquidity(indexed uint256,uint128,uint256,uint256)`**
  - Reduces position liquidity
  - Recalculates current position values

- **`Collect(indexed uint256,address,uint256,uint256)`**
  - Tracks fee collection events
  - Updates position state

- **`Transfer(indexed address,indexed address,indexed uint256)`**
  - Handles NFT ownership changes
  - Marks positions as closed when transferred out
  - Updates position cache

### Velodrome CL NFT Manager
**Contract**: `0x416b433906b1B72FA758e166e239c43d68dC6F29`  
**GitHub**: [`src/veloNFTManager.ts`](../src/veloNFTManager.ts)

#### Events Tracked:
Same events as Uniswap V3, but with Velodrome-specific logic:
- Uses tick spacing instead of fee tiers
- Different pool derivation logic
- Velodrome-specific price calculations

### Velodrome V2 Pools
**GitHub**: [`src/veloV2Pool.ts`](../src/veloV2Pool.ts)

#### Events Tracked:
- **`Mint(indexed address,uint256,uint256)`**
  - Creates new AMM position
  - Calculates LP token amounts

- **`Burn(indexed address,indexed address,uint256,uint256)`**
  - Removes liquidity from AMM position
  - Updates position values

- **`Sync(uint256,uint256)`**
  - Updates pool reserves for accurate pricing

- **`Transfer(indexed address,indexed address,uint256)`**
  - Tracks LP token transfers

### OLAS Staking Proxy
**Contract**: `0xa45E64d13A30a51b91ae0eb182e88a40e9b18eD8`  
**GitHub**: [`src/olasRewards.ts`](../src/olasRewards.ts)

#### Events Tracked:
- **`Checkpoint(uint256,uint256,uint256[],uint256[],uint256)`**
  - Main reward distribution event
  - Updates cumulative OLAS rewards
  - Converts to USD using price oracles

- **`ServiceStaked(uint256,indexed uint256,indexed address,indexed address,uint256[])`**
  - Tracks when service starts staking
  - Initializes OLAS rewards tracking

- **`ServiceUnstaked(uint256,indexed uint256,indexed address,indexed address,uint256[],uint256,uint256)`**
  - Handles final reward distribution
  - Resets staked amounts

### ERC20 Token Transfers
**GitHub**: [`src/funding.ts`](../src/funding.ts), [`src/tokenBalances.ts`](../src/tokenBalances.ts)

#### Tokens Tracked:
- USDC Native: `0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85`
- USDC Bridged: `0x7F5c764cBc14f9669B88837ca1490cCa17c31607`
- WETH: `0x4200000000000000000000000000000000000006`
- DAI: `0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1`
- USDT: `0x94b008aA00579c1307B0EF2c499aD98a8ce58e58`
- DOLA: `0x8aE125E8653821E851F12A49F7765db9a9ce7384`
- BOLD: `0x087C440F251ff6cFE62B86dde1be558b95b4bb9b`
- LUSD: `0xc40F949F8a4e094D1b49a23ea9241D289B7b2819`
- FRAX: `0x2E3D870790dC77A83DD1d18184Acc7439A53f475`
- sDAI: `0x2218A117083f5B482B0bB821d27056Ba9c04b1D3`

#### Events Tracked:
- **`Transfer(indexed address,indexed address,uint256)`**
  - Validates funding sources (operator or EOA only)
  - Updates funding balances for USDC
  - Updates token balances for all whitelisted tokens

## Price Discovery System

**GitHub**: [`src/priceDiscovery.ts`](../src/priceDiscovery.ts), [`src/priceAdapters.ts`](../src/priceAdapters.ts)

### Price Source Hierarchy
1. **Chainlink Oracles** (Highest Priority)
   - ETH/USD: `0x13e3Ee699D1909E989722E753853AE30b17e08c5`
   - USDC/USD: `0x16a9FA2FDa030272Ce99B29CF780dFA30361E0f3`
   - Direct feeds for major tokens

2. **DEX Pool Prices** (Fallback)
   - Uniswap V3 pools
   - Velodrome V2 pools
   - Curve 3pool for stablecoins

3. **Emergency Fallbacks**
   - $1.00 for critical stablecoins (USDC, USDT, DAI, LUSD)
   - Prevents total system failure

### Price Caching
- **Cache Duration**: 5 minutes (`PRICE_CACHE_DURATION = 300`)
- **Minimum Confidence**: 50% (`MIN_CONFIDENCE_THRESHOLD = 0.5`)
- **Validation**: Price bounds checking ($0.0001 - $100,000)

### Price Update Flow
```typescript
// From priceDiscovery.ts
export function getTokenPriceUSD(
  tokenAddress: Address,
  currentTimestamp: BigInt,
  forceRefresh: boolean = false
): BigDecimal
```

1. Check token whitelist
2. Load cached price if valid
3. Try price sources in priority order
4. Validate price bounds
5. Update token entity and create PriceUpdate record
6. Return price or fallback

## Portfolio Update Triggers

**GitHub**: [`src/helpers.ts`](../src/helpers.ts) - `calculatePortfolioMetrics()`

### When Portfolio Updates Occur:
1. **Funding Changes** - Any USDC transfer to/from agent safe
2. **Position Changes** - Any DeFi position creation, modification, or closure
3. **OLAS Rewards** - Any OLAS reward distribution
4. **Token Balance Changes** - Any ERC20 transfer to/from agent safe

### Portfolio Calculation Flow:
```typescript
// From helpers.ts
export function calculatePortfolioMetrics(
  serviceSafe: Address, 
  block: ethereum.Block
): void
```

1. **Load/Create Portfolio Entity**
2. **Calculate Initial Investment** - From `FundingBalance.netUsd`
3. **Calculate Positions Value** - Sum all active `ProtocolPosition.usdCurrent`
4. **Calculate Uninvested Value** - Sum all `TokenBalance.balanceUSD`
5. **Calculate OLAS Rewards Value** - From `OlasRewards.olasRewardsEarnedUSD`
6. **Calculate Final Value** - `positionsValue + uninvestedValue + olasRewardsValue`
7. **Calculate Performance Metrics** - ROI and APR
8. **Create Portfolio Snapshot** - Historical record

## Funding Balance Logic

**GitHub**: [`src/funding.ts`](../src/funding.ts), [`src/helpers.ts`](../src/helpers.ts)

### Why Incoming - Outgoing?

The funding balance tracks `totalInUsd - totalOutUsd = netUsd` because of the **re-funding bug incident**:

1. **Original Issue**: Agents were accidentally refunded multiple times due to a bug
2. **Fix Implementation**: A mechanism was introduced to send back excess funds
3. **Tracking Need**: The subgraph needed to track both directions to calculate true net investment

### Funding Source Validation
```typescript
// From common.ts
export function isFundingSource(
  addr: Address, 
  serviceSafe: Address,
  block: ethereum.Block, 
  txHash: string = ""
): boolean
```

**Valid Sources**:
- Service operator address
- EOA (Externally Owned Account) addresses
- **Invalid**: Contract addresses (prevents manipulation)

### Funding Flow Logic:
1. **Incoming Transfer** - `totalInUsd += amount`
2. **Outgoing Transfer** - `totalOutUsd += amount`
3. **Net Calculation** - `netUsd = totalInUsd - totalOutUsd`
4. **Portfolio Update** - Triggers portfolio recalculation

## Portfolio Calculations

**GitHub**: [`src/helpers.ts`](../src/helpers.ts)

### Final Value Calculation
```
Final Value = Positions Value + Uninvested Value + OLAS Rewards Value
```

**Components**:
- **Positions Value**: Sum of all active DeFi positions in USD
- **Uninvested Value**: Token balances held in safe (not in positions)
- **OLAS Rewards Value**: USD value of accumulated OLAS staking rewards

### Position Value Calculation
**Concentrated Liquidity** (Uniswap V3, Velodrome CL):
```typescript
// From veloCLShared.ts
const amounts = LiquidityAmounts.getAmountsForLiquidity(
  slot0.value0, sqrtPa, sqrtPb, data.value7
)
const usd0 = amount0Human.times(token0Price)
const usd1 = amount1Human.times(token1Price)
const usd = usd0.plus(usd1)
```

**AMM Positions** (Velodrome V2):
```typescript
// From veloV2Shared.ts
const totalSupply = pool.totalSupply()
const reserves = pool.getReserves()
const share = lpBalance.div(totalSupply)
const amount0 = reserves.reserve0.times(share)
const amount1 = reserves.reserve1.times(share)
```

## Performance Metrics

**GitHub**: [`src/helpers.ts`](../src/helpers.ts)

### ROI (Return on Investment)
```
ROI = (Final Value - Initial Value) / Initial Value × 100
```

**Example**:
- Initial Investment: $1,000
- Current Value: $1,200
- ROI = ($1,200 - $1,000) / $1,000 × 100 = 20%

### APR (Annualized Percentage Return)
```
APR = ROI × (365 / Days Since First Trade)
```

**Example**:
- ROI: 20%
- Days Since First Trade: 30
- APR = 20% × (365 / 30) = 243.33%

### First Trading Timestamp
- Set when agent creates their first DeFi position
- Used as the start date for APR calculations
- Updated via `updateFirstTradingTimestamp()` function

### Performance Tracking
- **Real-time Updates**: Metrics recalculated on every transaction
- **Historical Snapshots**: `AgentPortfolioSnapshot` entities created for trend analysis
- **Confidence Levels**: Price confidence affects metric reliability

## Code References

### Core Files
- **Service Discovery**: [`src/serviceRegistry.ts`](../src/serviceRegistry.ts)
- **Funding Tracking**: [`src/funding.ts`](../src/funding.ts)
- **Portfolio Calculations**: [`src/helpers.ts`](../src/helpers.ts)
- **Price Discovery**: [`src/priceDiscovery.ts`](../src/priceDiscovery.ts)
- **Token Balances**: [`src/tokenBalances.ts`](../src/tokenBalances.ts)
- **OLAS Rewards**: [`src/olasRewards.ts`](../src/olasRewards.ts)

### Protocol-Specific Files
- **Uniswap V3**: [`src/uniV3NFTManager.ts`](../src/uniV3NFTManager.ts), [`src/uniV3Shared.ts`](../src/uniV3Shared.ts)
- **Velodrome CL**: [`src/veloNFTManager.ts`](../src/veloNFTManager.ts), [`src/veloCLShared.ts`](../src/veloCLShared.ts)
- **Velodrome V2**: [`src/veloV2Pool.ts`](../src/veloV2Pool.ts), [`src/veloV2Shared.ts`](../src/veloV2Shared.ts)

### Configuration Files
- **Subgraph Manifest**: [`subgraph.yaml`](../subgraph.yaml)
- **GraphQL Schema**: [`schema.graphql`](../schema.graphql)
- **Token Configuration**: [`src/tokenConfig.ts`](../src/tokenConfig.ts)
- **Constants**: [`src/constants.ts`](../src/constants.ts)

### Utility Files
- **Common Functions**: [`src/common.ts`](../src/common.ts)
- **Configuration**: [`src/config.ts`](../src/config.ts)
- **Price Adapters**: [`src/priceAdapters.ts`](../src/priceAdapters.ts)
- **Math Libraries**: [`src/libraries/LiquidityAmounts.ts`](../src/libraries/LiquidityAmounts.ts), [`src/libraries/TickMath.ts`](../src/libraries/TickMath.ts)

### GitHub Repository
**Main Repository**: [Agent Funding Subgraph](https://github.com/your-org/agent-funding-subgraph)

### Key Functions by File

#### `src/helpers.ts`
- `calculatePortfolioMetrics()` - Main portfolio calculation
- `updateFunding()` - Updates funding balances
- `updateFirstTradingTimestamp()` - Sets first trade time

#### `src/priceDiscovery.ts`
- `getTokenPriceUSD()` - Main price discovery function
- `getPriceFromSources()` - Tries multiple price sources
- `validatePriceResult()` - Price validation logic

#### `src/veloCLShared.ts`
- `refreshVeloCLPosition()` - Updates Velodrome CL positions
- `refreshVeloCLPositionWithEventAmounts()` - Uses event data for entry amounts
- `ensurePoolTemplate()` - Creates pool datasources

#### `src/serviceRegistry.ts`
- `handleRegisterInstance()` - Processes agent registration
- `handleCreateMultisigWithAgents()` - Creates service entities
- `findServiceByServiceId()` - Service lookup utilities

This technical documentation provides the complete implementation details for understanding how the Agent Funding Subgraph tracks, processes, and analyzes autonomous agent DeFi activities on Optimism.
