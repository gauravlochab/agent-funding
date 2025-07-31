import { 
  BigInt, 
  BigDecimal, 
  Address, 
  Bytes,
  ethereum,
  log
} from "@graphprotocol/graph-ts"

import { ProtocolPosition, Service } from "../generated/schema"
import { VelodromeV2Pool } from "../generated/templates/VeloV2Pool/VelodromeV2Pool"
import { VeloV2Pool as VeloV2PoolTemplate } from "../generated/templates"
import { getTokenPriceUSD } from "./priceDiscovery"
import { getServiceByAgent } from "./config"
import { updateFirstTradingTimestamp } from "./helpers"

// VelodromeV2 Router address on Optimism
const VELODROME_V2_ROUTER = Address.fromString("0xa062ae8a9c5e11aaa026fc2670b0d65ccc8b2858")

// Cache for VelodromeV2 pools to avoid repeated RPC calls
let poolCache = new Map<string, bool>()

// Helper function to get token decimals (reuse existing logic)
function getTokenDecimals(tokenAddress: Address): i32 {
  const tokenHex = tokenAddress.toHexString().toLowerCase()
  
  // Known token decimals on Optimism (same as existing code)
  if (tokenHex == "0x0b2c639c533813f4aa9d7837caf62653d097ff85") return 6  // USDC
  if (tokenHex == "0x7f5c764cbc14f9669b88837ca1490cca17c31607") return 6  // USDC.e
  if (tokenHex == "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58") return 6  // USDT
  if (tokenHex == "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1") return 18 // DAI
  if (tokenHex == "0x4200000000000000000000000000000000000006") return 18 // WETH
  if (tokenHex == "0x2e3d870790dc77a83dd1d18184acc7439a53f475") return 18 // FRAX
  if (tokenHex == "0xc40f949f8a4e094d1b49a23ea9241d289b7b2819") return 18 // LUSD
  if (tokenHex == "0x8ae125e8653821e851f12a49f7765db9a9ce7384") return 18 // DOLA
  if (tokenHex == "0x087c440f251ff6cfe62b86dde1be558b95b4bb9b") return 18 // BOLD
  if (tokenHex == "0x2218a117083f5b482b0bb821d27056ba9c04b1d3") return 18 // sDAI
  
  // Default to 18 decimals for unknown tokens
  log.warning("VELODROME V2: Unknown token decimals for {}, defaulting to 18", [tokenHex])
  return 18
}

// Helper function to get token symbol (reuse existing logic)
function getTokenSymbol(tokenAddress: Address): string {
  const tokenHex = tokenAddress.toHexString().toLowerCase()
  
  // Known token symbols on Optimism (same as existing code)
  if (tokenHex == "0x0b2c639c533813f4aa9d7837caf62653d097ff85") return "USDC"
  if (tokenHex == "0x7f5c764cbc14f9669b88837ca1490cca17c31607") return "USDC.e"
  if (tokenHex == "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58") return "USDT"
  if (tokenHex == "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1") return "DAI"
  if (tokenHex == "0x4200000000000000000000000000000000000006") return "WETH"
  if (tokenHex == "0x2e3d870790dc77a83dd1d18184acc7439a53f475") return "FRAX"
  if (tokenHex == "0xc40f949f8a4e094d1b49a23ea9241d289b7b2819") return "LUSD"
  if (tokenHex == "0x8ae125e8653821e851f12a49f7765db9a9ce7384") return "DOLA"
  if (tokenHex == "0x087c440f251ff6cfe62b86dde1be558b95b4bb9b") return "BOLD"
  if (tokenHex == "0x2218a117083f5b482b0bb821d27056ba9c04b1d3") return "sDAI"
  
  // Return the address as fallback for unknown tokens
  log.warning("VELODROME V2: Unknown token symbol for {}, using address", [tokenHex])
  return tokenAddress.toHexString()
}

// Helper function to convert token amount to human readable format
function toHumanAmount(amount: BigInt, decimals: i32): BigDecimal {
  if (amount.equals(BigInt.zero())) {
    return BigDecimal.zero()
  }
  
  let divisor = BigInt.fromI32(10).pow(decimals as u8)
  return amount.toBigDecimal().div(divisor.toBigDecimal())
}

// Ensure pool template is created for tracking events
export function ensureVeloV2PoolTemplate(poolAddress: Address): void {
  const poolKey = poolAddress.toHexString()
  
  log.debug("VELODROME V2 TEMPLATE: ensureVeloV2PoolTemplate called for pool {}", [poolKey])
  
  if (!poolCache.has(poolKey)) {
    log.info("VELODROME V2 TEMPLATE: Creating NEW pool template for {}", [poolKey])
    VeloV2PoolTemplate.create(poolAddress)
    poolCache.set(poolKey, true)
    log.debug("VELODROME V2 TEMPLATE: Pool template CREATED successfully for {}", [poolKey])
  } else {
    log.debug("VELODROME V2 TEMPLATE: Pool template already exists for {} - skipping creation", [poolKey])
  }
}

// Create or get VelodromeV2 position ID
export function getVeloV2PositionId(userAddress: Address, poolAddress: Address): Bytes {
  // For VelodromeV2, we use user-pool combination as position ID since there are no NFTs
  const positionId = userAddress.toHex() + "-velodromev2-" + poolAddress.toHex()
  return Bytes.fromUTF8(positionId)
}

// Refresh VelodromeV2 position with event amounts (for Mint events)
export function refreshVeloV2PositionWithEventAmounts(
  userAddress: Address,
  poolAddress: Address, 
  block: ethereum.Block,
  eventAmount0: BigInt,
  eventAmount1: BigInt,
  txHash: Bytes
): void {
  const positionId = getVeloV2PositionId(userAddress, poolAddress)
  
  // Only track positions owned by a service
  log.debug("VELODROME V2 SHARED: Checking if address {} is a service", [userAddress.toHexString()])
  const service = getServiceByAgent(userAddress)
  if (service == null) {
    log.debug("VELODROME V2 SHARED: Skipping position for non-service address {}", [
      userAddress.toHexString()
    ])
    return
  }
  log.debug("VELODROME V2 SHARED: Address {} IS a service, proceeding with position creation", [userAddress.toHexString()])
  
  let pp = ProtocolPosition.load(positionId)
  if (!pp) {
    pp = new ProtocolPosition(positionId)
    pp.agent = userAddress
    pp.service = userAddress // Link to service
    pp.protocol = "velodrome-v2"
    pp.pool = poolAddress
    pp.isActive = true
    pp.tokenId = BigInt.zero() // VelodromeV2 doesn't use tokenIds
    
    // Update service positionIds array
    let serviceEntity = Service.load(userAddress)
    if (serviceEntity != null) {
      if (serviceEntity.positionIds == null) {
        serviceEntity.positionIds = []
      }
      let positionIds = serviceEntity.positionIds
      let positionIdString = positionId.toHexString()
      if (positionIds.indexOf(positionIdString) == -1) {
        positionIds.push(positionIdString)
        serviceEntity.positionIds = positionIds
        serviceEntity.save()
      }
      
      // Update first trading timestamp
      updateFirstTradingTimestamp(userAddress, block.timestamp)
    }
    
    // Initialize all required fields
    pp.usdCurrent = BigDecimal.zero()
    pp.amount0 = BigDecimal.zero()
    pp.amount0USD = BigDecimal.zero()
    pp.amount1 = BigDecimal.zero()
    pp.amount1USD = BigDecimal.zero()
    pp.liquidity = BigInt.zero()
    
    // Initialize entry tracking fields
    pp.entryTxHash = Bytes.empty()
    pp.entryTimestamp = BigInt.zero()
    pp.entryAmount0 = BigDecimal.zero()
    pp.entryAmount0USD = BigDecimal.zero()
    pp.entryAmount1 = BigDecimal.zero()
    pp.entryAmount1USD = BigDecimal.zero()
    pp.entryAmountUSD = BigDecimal.zero()
    
    // Initialize static metadata fields
    pp.tickLower = 0
    pp.tickUpper = 0
    pp.tickSpacing = 0 // Not applicable for VelodromeV2
    pp.fee = 0 // Will be set based on pool type
    
    // Get pool metadata
    const poolContract = VelodromeV2Pool.bind(poolAddress)
    
    const token0Result = poolContract.try_token0()
    const token1Result = poolContract.try_token1()
    const stableResult = poolContract.try_stable()
    
    if (!token0Result.reverted && !token1Result.reverted) {
      pp.token0 = token0Result.value
      pp.token1 = token1Result.value
      pp.token0Symbol = getTokenSymbol(token0Result.value)
      pp.token1Symbol = getTokenSymbol(token1Result.value)
      
      // Set fee based on pool type (stable vs volatile)
      if (!stableResult.reverted) {
        pp.fee = stableResult.value ? 5 : 30 // 0.05% for stable, 0.30% for volatile
      }
    }
  }
  
  // Get pool metadata if not already set
  if (!pp.token0) {
    const poolContract = VelodromeV2Pool.bind(poolAddress)
    
    const token0Result = poolContract.try_token0()
    const token1Result = poolContract.try_token1()
    const stableResult = poolContract.try_stable()
    
    if (!token0Result.reverted && !token1Result.reverted) {
      pp.token0 = token0Result.value
      pp.token1 = token1Result.value
      pp.token0Symbol = getTokenSymbol(token0Result.value)
      pp.token1Symbol = getTokenSymbol(token1Result.value)
      
      // Set fee based on pool type (stable vs volatile)
      if (!stableResult.reverted) {
        pp.fee = stableResult.value ? 5 : 30 // 0.05% for stable, 0.30% for volatile
      }
    }
  }
  
  // Convert event amounts to human readable format
  const token0Decimals = getTokenDecimals(Address.fromBytes(pp.token0!))
  const token1Decimals = getTokenDecimals(Address.fromBytes(pp.token1!))
  
  const eventAmount0Human = toHumanAmount(eventAmount0, token0Decimals)
  const eventAmount1Human = toHumanAmount(eventAmount1, token1Decimals)
  
  // Get USD values
  const eventUsd0 = getTokenPriceUSD(Address.fromBytes(pp.token0!), block.timestamp, false).times(eventAmount0Human)
  const eventUsd1 = getTokenPriceUSD(Address.fromBytes(pp.token1!), block.timestamp, false).times(eventAmount1Human)
  const eventUsd = eventUsd0.plus(eventUsd1)
  
  log.info("VELODROME V2: Processing position {} - eventAmount0: {}, eventAmount1: {}, eventUsd: {}", [
    positionId.toHexString(),
    eventAmount0Human.toString(),
    eventAmount1Human.toString(),
    eventUsd.toString()
  ])
  
  // Check if this is the first time adding liquidity (new position)
  if (pp.entryAmountUSD.equals(BigDecimal.zero()) && pp.entryTimestamp.equals(BigInt.zero())) {
    // This is the FIRST Mint event for a new position - set initial entry amounts
    pp.entryTxHash = txHash
    pp.entryTimestamp = block.timestamp
    pp.entryAmount0 = eventAmount0Human
    pp.entryAmount0USD = eventUsd0
    pp.entryAmount1 = eventAmount1Human
    pp.entryAmount1USD = eventUsd1
    pp.entryAmountUSD = eventUsd
    
    log.info("VELODROME V2: Position {} INITIAL ENTRY SET from Mint - entryAmount0: {}, entryAmount1: {}, entryAmountUSD: {}", [
      positionId.toHexString(),
      pp.entryAmount0.toString(),
      pp.entryAmount1.toString(),
      pp.entryAmountUSD.toString()
    ])
  } else {
    // This is a subsequent Mint event - add to existing entry amounts
    pp.entryAmount0 = pp.entryAmount0.plus(eventAmount0Human)
    pp.entryAmount0USD = pp.entryAmount0USD.plus(eventUsd0)
    pp.entryAmount1 = pp.entryAmount1.plus(eventAmount1Human)
    pp.entryAmount1USD = pp.entryAmount1USD.plus(eventUsd1)
    pp.entryAmountUSD = pp.entryAmountUSD.plus(eventUsd)
    
    log.info("VELODROME V2: Position {} ENTRY INCREASED from Mint - entryAmount0: {}, entryAmount1: {}, entryAmountUSD: {}", [
      positionId.toHexString(),
      pp.entryAmount0.toString(),
      pp.entryAmount1.toString(),
      pp.entryAmountUSD.toString()
    ])
  }
  
  // Save the updated entry amounts first
  pp.save()
  
  // Update current amounts by calling the regular refresh function
  refreshVeloV2Position(userAddress, poolAddress, block, txHash)
}

// Refresh VelodromeV2 position (for current state updates)
export function refreshVeloV2Position(
  userAddress: Address,
  poolAddress: Address,
  block: ethereum.Block,
  txHash: Bytes
): void {
  const positionId = getVeloV2PositionId(userAddress, poolAddress)
  
  // Only track positions owned by a service
  log.debug("VELODROME V2 REFRESH: Checking if address {} is a service", [
    userAddress.toHexString()
  ])
  
  const service = getServiceByAgent(userAddress)
  if (service == null) {
    log.debug("VELODROME V2 REFRESH: Skipping refresh for non-service address {}", [userAddress.toHexString()])
    return
  }
  
  log.debug("VELODROME V2 REFRESH: Address {} IS a service, proceeding with refresh", [userAddress.toHexString()])
  
  let pp = ProtocolPosition.load(positionId)
  if (!pp) {
    log.debug("VELODROME V2 REFRESH: Position {} not found, creating new position for pool {}", [
      positionId.toHexString(),
      poolAddress.toHexString()
    ])
    
    // Create a new position if it doesn't exist
    pp = new ProtocolPosition(positionId)
    pp.agent = userAddress
    pp.service = userAddress // Link to service
    pp.protocol = "velodrome-v2"
    pp.pool = poolAddress
    pp.isActive = true
    pp.tokenId = BigInt.zero() // VelodromeV2 doesn't use tokenIds
    
    // Update service positionIds array
    let serviceEntity = Service.load(userAddress)
    if (serviceEntity != null) {
      if (serviceEntity.positionIds == null) {
        serviceEntity.positionIds = []
      }
      let positionIds = serviceEntity.positionIds
      let positionIdString = positionId.toHexString()
      if (positionIds.indexOf(positionIdString) == -1) {
        positionIds.push(positionIdString)
        serviceEntity.positionIds = positionIds
        serviceEntity.save()
      }
      
      // Update first trading timestamp
      updateFirstTradingTimestamp(userAddress, block.timestamp)
    }
    
    // Initialize all required fields
    pp.usdCurrent = BigDecimal.zero()
    pp.amount0 = BigDecimal.zero()
    pp.amount0USD = BigDecimal.zero()
    pp.amount1 = BigDecimal.zero()
    pp.amount1USD = BigDecimal.zero()
    pp.liquidity = BigInt.zero()
    
    // Initialize entry tracking fields - will be set when we calculate current amounts
    pp.entryTxHash = Bytes.empty()
    pp.entryTimestamp = BigInt.zero()
    pp.entryAmount0 = BigDecimal.zero()
    pp.entryAmount0USD = BigDecimal.zero()
    pp.entryAmount1 = BigDecimal.zero()
    pp.entryAmount1USD = BigDecimal.zero()
    pp.entryAmountUSD = BigDecimal.zero()
    
    // Initialize static metadata fields
    pp.tickLower = 0
    pp.tickUpper = 0
    pp.tickSpacing = 0 // Not applicable for VelodromeV2
    pp.fee = 0 // Will be set based on pool type
    
    // Get pool metadata for new position
    const poolContract = VelodromeV2Pool.bind(poolAddress)
    
    const token0Result = poolContract.try_token0()
    const token1Result = poolContract.try_token1()
    const stableResult = poolContract.try_stable()
    
    if (!token0Result.reverted && !token1Result.reverted) {
      pp.token0 = token0Result.value
      pp.token1 = token1Result.value
      pp.token0Symbol = getTokenSymbol(token0Result.value)
      pp.token1Symbol = getTokenSymbol(token1Result.value)
      
      // Set fee based on pool type (stable vs volatile)
      if (!stableResult.reverted) {
        pp.fee = stableResult.value ? 5 : 30 // 0.05% for stable, 0.30% for volatile
      }
    } else {
      log.warning("VELODROME V2 REFRESH: Failed to get token addresses for pool {}", [poolAddress.toHexString()])
      return
    }
  }
  
  const poolContract = VelodromeV2Pool.bind(poolAddress)
  
  // Get user's LP token balance
  const balanceResult = poolContract.try_balanceOf(userAddress)
  const totalSupplyResult = poolContract.try_totalSupply()
  const reservesResult = poolContract.try_getReserves()
  
  if (balanceResult.reverted || totalSupplyResult.reverted || reservesResult.reverted) {
    log.warning("VELODROME V2: Failed to get pool data for {}", [poolAddress.toHexString()])
    return
  }
  
  const userBalance = balanceResult.value
  const totalSupply = totalSupplyResult.value
  const reserves = reservesResult.value
  
  // If user has no LP tokens, mark position as inactive
  if (userBalance.equals(BigInt.zero())) {
    pp.isActive = false
    pp.usdCurrent = BigDecimal.zero()
    pp.amount0 = BigDecimal.zero()
    pp.amount0USD = BigDecimal.zero()
    pp.amount1 = BigDecimal.zero()
    pp.amount1USD = BigDecimal.zero()
    pp.liquidity = BigInt.zero()
    
    log.info("VELODROME V2: Position {} marked inactive - no LP tokens", [positionId.toHexString()])
  } else {
    // Calculate user's share of the pool
    const userShare = userBalance.toBigDecimal().div(totalSupply.toBigDecimal())
    
    // Calculate current token amounts based on reserves and user's share
    const token0Decimals = getTokenDecimals(Address.fromBytes(pp.token0!))
    const token1Decimals = getTokenDecimals(Address.fromBytes(pp.token1!))
    
    const reserve0Human = toHumanAmount(reserves.value0, token0Decimals)
    const reserve1Human = toHumanAmount(reserves.value1, token1Decimals)
    
    pp.amount0 = reserve0Human.times(userShare)
    pp.amount1 = reserve1Human.times(userShare)
    
    // Calculate USD values
    pp.amount0USD = getTokenPriceUSD(Address.fromBytes(pp.token0!), block.timestamp, false).times(pp.amount0!)
    pp.amount1USD = getTokenPriceUSD(Address.fromBytes(pp.token1!), block.timestamp, false).times(pp.amount1!)
    pp.usdCurrent = pp.amount0USD.plus(pp.amount1USD)
    pp.liquidity = userBalance // Store LP token balance as liquidity
    
    pp.isActive = true
    
    // If this is a new position (entry amounts not set), use current amounts as entry
    if (pp.entryAmountUSD.equals(BigDecimal.zero()) && pp.entryTimestamp.equals(BigInt.zero())) {
      pp.entryTxHash = txHash
      pp.entryTimestamp = block.timestamp
      pp.entryAmount0 = pp.amount0!
      pp.entryAmount0USD = pp.amount0USD!
      pp.entryAmount1 = pp.amount1!
      pp.entryAmount1USD = pp.amount1USD!
      pp.entryAmountUSD = pp.usdCurrent
      
      log.info("VELODROME V2: Position {} INITIAL ENTRY SET from current state - entryAmount0: {}, entryAmount1: {}, entryAmountUSD: {}", [
        positionId.toHexString(),
        pp.entryAmount0.toString(),
        pp.entryAmount1.toString(),
        pp.entryAmountUSD.toString()
      ])
    }
    
    log.debug("VELODROME V2: Position {} UPDATED - amount0: {}, amount1: {}, usdCurrent: {}", [
      positionId.toHexString(),
      pp.amount0!.toString(),
      pp.amount1!.toString(),
      pp.usdCurrent.toString()
    ])
  }
  
  pp.save()
}

// Handle VelodromeV2 Burn events (liquidity removal)
export function refreshVeloV2PositionWithBurnAmounts(
  userAddress: Address,
  poolAddress: Address,
  block: ethereum.Block,
  eventAmount0: BigInt,
  eventAmount1: BigInt,
  txHash: Bytes
): void {
  const positionId = getVeloV2PositionId(userAddress, poolAddress)
  
  log.warning("===== VELODROME V2 BURN PROCESSING START =====", [])
  log.warning("VELODROME V2 BURN: Processing burn for user: {}, pool: {}, positionId: {}", [
    userAddress.toHexString(),
    poolAddress.toHexString(),
    positionId.toHexString()
  ])
  log.warning("VELODROME V2 BURN: Raw amounts - amount0: {}, amount1: {}", [
    eventAmount0.toString(),
    eventAmount1.toString()
  ])
  log.warning("VELODROME V2 BURN: Block: {}, TxHash: {}, Timestamp: {}", [
    block.number.toString(),
    txHash.toHexString(),
    block.timestamp.toString()
  ])
  
  // Only track positions owned by a service
  const service = getServiceByAgent(userAddress)
  if (service == null) {
    log.warning("VELODROME V2 BURN: Skipping burn for non-service address {}", [
      userAddress.toHexString()
    ])
    return
  }
  
  log.warning("VELODROME V2 BURN: User {} IS a service, proceeding with burn processing", [userAddress.toHexString()])
  
  let pp = ProtocolPosition.load(positionId)
  if (!pp) {
    log.error("VELODROME V2 BURN: Position {} not found for burn - this should not happen in production!", [positionId.toHexString()])
    log.error("VELODROME V2 BURN: User: {}, Pool: {}, TxHash: {}", [
      userAddress.toHexString(),
      poolAddress.toHexString(),
      txHash.toHexString()
    ])
    return
  }
  
  log.warning("VELODROME V2 BURN: Position found - current state before burn:", [])
  log.warning("VELODROME V2 BURN: - isActive: {}, liquidity: {}", [
    pp.isActive.toString(),
    pp.liquidity ? pp.liquidity!.toString() : "0"
  ])
  log.warning("VELODROME V2 BURN: - current amount0: {}, amount1: {}, usdCurrent: {}", [
    pp.amount0 ? pp.amount0!.toString() : "0",
    pp.amount1 ? pp.amount1!.toString() : "0",
    pp.usdCurrent.toString()
  ])
  log.warning("VELODROME V2 BURN: - entry amount0: {}, amount1: {}, entryUSD: {}", [
    pp.entryAmount0.toString(),
    pp.entryAmount1.toString(),
    pp.entryAmountUSD.toString()
  ])
  
  // Convert event amounts to human readable format
  const token0Decimals = getTokenDecimals(Address.fromBytes(pp.token0!))
  const token1Decimals = getTokenDecimals(Address.fromBytes(pp.token1!))
  
  const token0Symbol = pp.token0Symbol ? pp.token0Symbol! : "TOKEN0"
  const token1Symbol = pp.token1Symbol ? pp.token1Symbol! : "TOKEN1"
  
  log.warning("VELODROME V2 BURN: Token decimals - token0 ({}): {}, token1 ({}): {}", [
    token0Symbol,
    token0Decimals.toString(),
    token1Symbol,
    token1Decimals.toString()
  ])
  
  const eventAmount0Human = toHumanAmount(eventAmount0, token0Decimals)
  const eventAmount1Human = toHumanAmount(eventAmount1, token1Decimals)
  
  log.warning("VELODROME V2 BURN: Human readable amounts - {} {}, {} {}", [
    eventAmount0Human.toString(),
    token0Symbol,
    eventAmount1Human.toString(),
    token1Symbol
  ])
  
  // Get USD values for exit tracking
  const eventUsd0 = getTokenPriceUSD(Address.fromBytes(pp.token0!), block.timestamp, false).times(eventAmount0Human)
  const eventUsd1 = getTokenPriceUSD(Address.fromBytes(pp.token1!), block.timestamp, false).times(eventAmount1Human)
  const eventUsd = eventUsd0.plus(eventUsd1)
  
  log.warning("VELODROME V2 BURN: USD values - {} USD ({}), {} USD ({}), total: {} USD", [
    eventUsd0.toString(),
    token0Symbol,
    eventUsd1.toString(),
    token1Symbol,
    eventUsd.toString()
  ])
  
  // Store previous exit amounts for comparison
  const previousExitAmount0 = pp.exitAmount0 ? pp.exitAmount0! : BigDecimal.zero()
  const previousExitAmount1 = pp.exitAmount1 ? pp.exitAmount1! : BigDecimal.zero()
  const previousExitUSD = pp.exitAmountUSD ? pp.exitAmountUSD! : BigDecimal.zero()
  
  log.warning("VELODROME V2 BURN: Previous exit amounts - {} {}, {} {}, {} USD", [
    previousExitAmount0.toString(),
    token0Symbol,
    previousExitAmount1.toString(),
    token1Symbol,
    previousExitUSD.toString()
  ])
  
  // Update exit tracking (if this is the final burn, these will be the exit amounts)
  pp.exitTxHash = txHash
  pp.exitTimestamp = block.timestamp
  pp.exitAmount0 = eventAmount0Human
  pp.exitAmount0USD = eventUsd0
  pp.exitAmount1 = eventAmount1Human
  pp.exitAmount1USD = eventUsd1
  pp.exitAmountUSD = eventUsd
  
  log.warning("VELODROME V2 BURN: Updated exit tracking - txHash: {}, timestamp: {}", [
    txHash.toHexString(),
    block.timestamp.toString()
  ])
  log.warning("VELODROME V2 BURN: New exit amounts - {} {}, {} {}, {} USD", [
    pp.exitAmount0!.toString(),
    token0Symbol,
    pp.exitAmount1!.toString(),
    token1Symbol,
    pp.exitAmountUSD!.toString()
  ])
  
  // Calculate PnL for logging
  const pnlAmount0 = pp.exitAmount0!.minus(pp.entryAmount0)
  const pnlAmount1 = pp.exitAmount1!.minus(pp.entryAmount1)
  const pnlUSD = pp.exitAmountUSD!.minus(pp.entryAmountUSD)
  
  log.warning("VELODROME V2 BURN: PnL calculation - {} {} ({}), {} {} ({}), {} USD", [
    pnlAmount0.gt(BigDecimal.zero()) ? "+" : "",
    pnlAmount0.toString(),
    token0Symbol,
    pnlAmount1.gt(BigDecimal.zero()) ? "+" : "",
    pnlAmount1.toString(),
    token1Symbol,
    pnlUSD.gt(BigDecimal.zero()) ? "+" : "",
    pnlUSD.toString()
  ])
  
  // Save and refresh current state
  pp.save()
  log.warning("VELODROME V2 BURN: Position saved, now refreshing current state...", [])
  
  refreshVeloV2Position(userAddress, poolAddress, block, txHash)
  
  log.warning("===== VELODROME V2 BURN PROCESSING END =====", [])
}
