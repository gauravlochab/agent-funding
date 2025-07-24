import { Address, BigDecimal, BigInt, ethereum, Bytes, log } from "@graphprotocol/graph-ts"
// NOTE: These imports will work once Uniswap V3 is added to subgraph.yaml and types are generated
import { NonfungiblePositionManager } from "../generated/UniV3NFTManager/NonfungiblePositionManager"
import { UniswapV3Pool } from "../generated/templates/UniV3Pool/UniswapV3Pool"
import { UniswapV3Factory } from "../generated/UniV3NFTManager/UniswapV3Factory"
import { UniV3Pool } from "../generated/templates"
import { LiquidityAmounts } from "./libraries/LiquidityAmounts"
import { TickMath } from "./libraries/TickMath"
import { ProtocolPosition } from "../generated/schema"
import { refreshPortfolio } from "./common"
import { addAgentNFTToPool, removeAgentNFTFromPool, getCachedPoolAddress, cachePoolAddress } from "./poolIndexCache"
import { getTokenPriceUSD } from "./priceDiscovery"
import { UNI_V3_MANAGER, UNI_V3_FACTORY } from "./constants"
import { isServiceAgent } from "./config"

// Helper function to get token decimals
function getTokenDecimals(tokenAddress: Address): i32 {
  const tokenHex = tokenAddress.toHexString().toLowerCase()
  
  // Known token decimals on Optimism
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
  log.warning("UNISWAP V3: Unknown token decimals for {}, defaulting to 18", [tokenHex])
  return 18
}

// Helper function to get token symbol
function getTokenSymbol(tokenAddress: Address): string {
  const tokenHex = tokenAddress.toHexString().toLowerCase()
  
  // Known token symbols on Optimism
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
  log.warning("UNISWAP V3: Unknown token symbol for {}, using address", [tokenHex])
  return tokenHex
}

// Helper function to convert token amount from wei to human readable
function convertTokenAmount(amount: BigInt, tokenAddress: Address): BigDecimal {
  const decimals = getTokenDecimals(tokenAddress)
  const divisor = BigDecimal.fromString("1e" + decimals.toString())
  return amount.toBigDecimal().div(divisor)
}

// Helper function to derive pool address from position data with caching
function getUniV3PoolAddress(token0: Address, token1: Address, fee: i32, tokenId: BigInt | null = null): Address {
  // Try cache first if we have a tokenId
  if (tokenId !== null) {
    const cached = getCachedPoolAddress("uniswap-v3", tokenId)
    if (cached !== null) {
      return cached
    }
  }
  
  // Factory call
  const factory = UniswapV3Factory.bind(UNI_V3_FACTORY)
  const poolResult = factory.try_getPool(token0, token1, fee as i32)
  
  if (poolResult.reverted) {
    log.error("UNISWAP V3: Failed to get pool from factory for tokens: {} / {}", [
      token0.toHexString(),
      token1.toHexString()
    ])
    return Address.zero()
  }
  
  const poolAddress = poolResult.value
  
  // Cache the result if we have a tokenId
  if (tokenId !== null) {
    cachePoolAddress("uniswap-v3", tokenId, poolAddress)
  }
  
  return poolAddress
}

// 1. Spawn pool template the first time we meet an NFT
export function ensureUniV3PoolTemplate(tokenId: BigInt): void {
  const mgr = NonfungiblePositionManager.bind(UNI_V3_MANAGER)
  const posResult = mgr.try_positions(tokenId)
  
  if (posResult.reverted) {
    log.error("UNISWAP V3: Failed to get position data for tokenId: {}", [tokenId.toString()])
    return
  }
  
  const pos = posResult.value
  
  // Derive pool address from position data with caching
  const poolAddress = getUniV3PoolAddress(pos.value2, pos.value3, pos.value4, tokenId)
  
  if (poolAddress.equals(Address.zero())) {
    log.error("UNISWAP V3: Failed to derive pool address for tokenId: {}", [tokenId.toString()])
    return
  }
  
  UniV3Pool.create(poolAddress)
  addAgentNFTToPool("uniswap-v3", poolAddress, tokenId)
}

// Helper function to check if position is closed
function isPositionClosed(liquidity: BigInt, amount0: BigDecimal, amount1: BigDecimal): boolean {
  const isLiquidityZero = liquidity.equals(BigInt.zero())
  const areAmountsZero = amount0.equals(BigDecimal.zero()) && amount1.equals(BigDecimal.zero())
    
  return isLiquidityZero || areAmountsZero
}

// 2a. Re-price NFT into USD + persist using actual event amounts for entry data
export function refreshUniV3PositionWithEventAmounts(
  tokenId: BigInt, 
  block: ethereum.Block, 
  eventAmount0: BigInt,
  eventAmount1: BigInt,
  txHash: Bytes = Bytes.empty()
): void {
  const mgr = NonfungiblePositionManager.bind(UNI_V3_MANAGER)
  
  // First, get the actual NFT owner
  const ownerResult = mgr.try_ownerOf(tokenId)
  if (ownerResult.reverted) {
    log.error("UNISWAP V3: Failed to get owner for tokenId: {}", [tokenId.toString()])
    return
  }
  
  const nftOwner = ownerResult.value

  // AGENT FILTERING: Only process positions owned by a service
  if (!isServiceAgent(nftOwner)) {
    log.info("UNISWAP V3: Skipping position {} - not owned by a service (owner: {})", [
      tokenId.toString(),
      nftOwner.toHexString()
    ])
    return
  }

  const dataResult = mgr.try_positions(tokenId)
  
  if (dataResult.reverted) {
    log.error("UNISWAP V3: positions() call failed for tokenId: {}", [tokenId.toString()])
    return
  }
  
  const data = dataResult.value

  // Derive pool address from position data with caching  
  const poolAddress = getUniV3PoolAddress(data.value2, data.value3, data.value4, tokenId)
  
  if (poolAddress.equals(Address.zero())) {
    log.error("UNISWAP V3: Failed to derive pool address for tokenId: {}", [tokenId.toString()])
    return
  }

  // USD pricing for event amounts
  const token0Price = getTokenPriceUSD(data.value2, block.timestamp, false)
  const token1Price = getTokenPriceUSD(data.value3, block.timestamp, false)

  // Convert event amounts from wei to human readable using proper decimals
  const eventAmount0Human = convertTokenAmount(eventAmount0, data.value2) // token0
  const eventAmount1Human = convertTokenAmount(eventAmount1, data.value3) // token1
  
  // Log the actual event amounts with transaction hash
  log.info("UNISWAP V3: Position {} event amounts from tx {} - amount0: {} ({}), amount1: {} ({})", [
    tokenId.toString(),
    txHash.toHexString(),
    eventAmount0.toString(),
    eventAmount0Human.toString(),
    eventAmount1.toString(), 
    eventAmount1Human.toString()
  ])
  
  const eventUsd0 = eventAmount0Human.times(token0Price)
  const eventUsd1 = eventAmount1Human.times(token1Price)
  const eventUsd = eventUsd0.plus(eventUsd1)

  // write ProtocolPosition - use actual NFT owner and event amounts for entry
  const idString = nftOwner.toHex() + "-" + tokenId.toString()
  const id = Bytes.fromUTF8(idString)
  let pp = ProtocolPosition.load(id)
  const isNewPosition = pp == null
  
  if (pp == null) {
    pp = new ProtocolPosition(id)
    pp.agent = nftOwner
    pp.protocol = "uniswap-v3"
    pp.pool = poolAddress
    pp.tokenId = tokenId
    pp.isActive = true
    
    // Set static position metadata
    pp.tickLower = data.value5 as i32
    pp.tickUpper = data.value6 as i32
    pp.fee = data.value4
    
    // Set entry data using ACTUAL EVENT AMOUNTS (not calculated)
    pp.entryTxHash = txHash
    pp.entryTimestamp = block.timestamp
    pp.entryAmount0 = eventAmount0Human  // Use actual event amount
    pp.entryAmount0USD = eventUsd0       // Use actual event amount
    pp.entryAmount1 = eventAmount1Human  // Use actual event amount
    pp.entryAmount1USD = eventUsd1       // Use actual event amount
    pp.entryAmountUSD = eventUsd
    
    // DEBUG: Log what we're setting as entry amounts
    log.info("UNISWAP V3: Position {} ENTRY AMOUNTS BEING SET - entryAmount0: {}, entryAmount1: {}, entryAmountUSD: {}", [
      tokenId.toString(),
      pp.entryAmount0.toString(),
      pp.entryAmount1.toString(),
      pp.entryAmountUSD.toString()
    ])
    
    // For new positions, calculate current amounts using liquidity math (not event amounts)
    // Call refreshUniV3Position to get current calculated amounts
    pp.save() // Save entry data first
    refreshUniV3Position(tokenId, block, txHash) // This will update current amounts
    return // Exit early since refreshUniV3Position will save the entity
  } else {
    // DEBUG: Log the BEFORE values to track accumulation
    log.info("UNISWAP V3: Position {} BEFORE UPDATE - entryAmount0: {}, entryAmount1: {}, entryAmountUSD: {}", [
      tokenId.toString(),
      pp.entryAmount0.toString(),
      pp.entryAmount1.toString(),
      pp.entryAmountUSD.toString()
    ])
    
    // For existing positions, update entry amounts if this is an IncreaseLiquidity event
    // Add to existing entry amounts
    pp.entryAmount0 = pp.entryAmount0.plus(eventAmount0Human)
    pp.entryAmount0USD = pp.entryAmount0USD.plus(eventUsd0)
    pp.entryAmount1 = pp.entryAmount1.plus(eventAmount1Human)
    pp.entryAmount1USD = pp.entryAmount1USD.plus(eventUsd1)
    pp.entryAmountUSD = pp.entryAmountUSD.plus(eventUsd)
    
    // DEBUG: Log what we're setting as entry amounts for existing positions
    log.info("UNISWAP V3: Position {} AFTER UPDATE - entryAmount0: {}, entryAmount1: {}, entryAmountUSD: {}", [
      tokenId.toString(),
      pp.entryAmount0.toString(),
      pp.entryAmount1.toString(),
      pp.entryAmountUSD.toString()
    ])
    
    // Save the updated entry amounts first
    pp.save()
    
    // Update current amounts by calling the regular refresh function
    refreshUniV3Position(tokenId, block, txHash)
    return // Exit early since refreshUniV3Position will save the entity
  }
}

// 2b. Re-price NFT into USD + persist (for non-entry events)
export function refreshUniV3Position(tokenId: BigInt, block: ethereum.Block, txHash: Bytes = Bytes.empty()): void {
  const mgr = NonfungiblePositionManager.bind(UNI_V3_MANAGER)
  
  // First, get the actual NFT owner
  const ownerResult = mgr.try_ownerOf(tokenId)
  if (ownerResult.reverted) {
    log.error("UNISWAP V3: Failed to get owner for tokenId: {}", [tokenId.toString()])
    return
  }
  
  const nftOwner = ownerResult.value

  // AGENT FILTERING: Only process positions owned by a service
  if (!isServiceAgent(nftOwner)) {
    log.info("UNISWAP V3: Skipping position {} - not owned by a service (owner: {})", [
      tokenId.toString(),
      nftOwner.toHexString()
    ])
    return
  }

  // Early check - don't process closed positions
  const idString = nftOwner.toHex() + "-" + tokenId.toString()
  const id = Bytes.fromUTF8(idString)
  let position = ProtocolPosition.load(id)
  
  if (position && !position.isActive) {
    return
  }
  
  const dataResult = mgr.try_positions(tokenId)
  
  if (dataResult.reverted) {
    log.error("UNISWAP V3: positions() call failed for tokenId: {}", [tokenId.toString()])
    return
  }
  
  const data = dataResult.value

  // Derive pool address from position data with caching  
  const poolAddress = getUniV3PoolAddress(data.value2, data.value3, data.value4, tokenId)
  
  if (poolAddress.equals(Address.zero())) {
    log.error("UNISWAP V3: Failed to derive pool address for tokenId: {}", [tokenId.toString()])
    return
  }
  
  // pool state
  const pool = UniswapV3Pool.bind(poolAddress)
  const slot0Result = pool.try_slot0()
  
  if (slot0Result.reverted) {
    log.error("UNISWAP V3: Failed to get slot0 from pool: {}", [poolAddress.toHexString()])
    return
  }
  
  const slot0 = slot0Result.value

  // convert liquidity → token amounts
  const tickLower = data.value5 as i32
  const tickUpper = data.value6 as i32
  
  // Add comprehensive debugging logs
  log.info("UNISWAP V3: Position {} calculation inputs - liquidity: {}, tickLower: {}, tickUpper: {}", [
    tokenId.toString(),
    data.value7.toString(),
    tickLower.toString(),
    tickUpper.toString()
  ])
  
  log.info("UNISWAP V3: Position {} pool state - sqrtPriceX96: {}, currentTick: {}", [
    tokenId.toString(),
    slot0.value0.toString(),
    slot0.value1.toString()
  ])
  
  const sqrtPa = TickMath.getSqrtRatioAtTick(tickLower)
  const sqrtPb = TickMath.getSqrtRatioAtTick(tickUpper)
  
  log.info("UNISWAP V3: Position {} sqrt prices - sqrtPa: {}, sqrtPb: {}, current: {}", [
    tokenId.toString(),
    sqrtPa.toString(),
    sqrtPb.toString(),
    slot0.value0.toString()
  ])
  
  const amounts = LiquidityAmounts.getAmountsForLiquidity(
                    slot0.value0, sqrtPa, sqrtPb, data.value7)

  // Log raw amounts from LiquidityAmounts calculation
  log.info("UNISWAP V3: Position {} raw amounts from LiquidityAmounts - amount0: {}, amount1: {}", [
    tokenId.toString(),
    amounts.amount0.toString(),
    amounts.amount1.toString()
  ])

  // USD pricing
  const token0Price = getTokenPriceUSD(data.value2, block.timestamp, false)
  const token1Price = getTokenPriceUSD(data.value3, block.timestamp, false)

  // Convert amounts from wei to human readable using proper decimals
  const amount0Human = convertTokenAmount(amounts.amount0, data.value2) // token0
  const amount1Human = convertTokenAmount(amounts.amount1, data.value3) // token1
  
  // Log token addresses and decimals used
  log.info("UNISWAP V3: Position {} tokens - token0: {} (decimals: {}), token1: {} (decimals: {})", [
    tokenId.toString(),
    data.value2.toHexString(),
    getTokenDecimals(data.value2).toString(),
    data.value3.toHexString(),
    getTokenDecimals(data.value3).toString()
  ])
  
  // Final converted amounts
  log.info("UNISWAP V3: Position {} final amounts - amount0Human: {}, amount1Human: {}", [
    tokenId.toString(),
    amount0Human.toString(),
    amount1Human.toString()
  ])
  
  const usd0 = amount0Human.times(token0Price)
  const usd1 = amount1Human.times(token1Price)
  const usd = usd0.plus(usd1)

  // write ProtocolPosition - use actual NFT owner
  let pp = ProtocolPosition.load(id)
  const isNewPosition = pp == null
  
  if (pp == null) {
    pp = new ProtocolPosition(id)
    pp.agent = nftOwner
    pp.protocol = "uniswap-v3"
    pp.pool = poolAddress
    pp.tokenId = tokenId
    pp.isActive = true
    
    // Set static position metadata - NOTE: Use fee instead of tickSpacing for Uniswap V3
    pp.tickLower = tickLower
    pp.tickUpper = tickUpper
    pp.fee = data.value4 // Uniswap V3 uses fee (500, 3000, 10000)
    
    // CRITICAL FIX: Initialize entry data to ZERO for new positions
    // Entry amounts should ONLY be set by refreshUniV3PositionWithEventAmounts
    pp.entryTxHash = Bytes.empty()
    pp.entryTimestamp = BigInt.zero()
    pp.entryAmount0 = BigDecimal.zero()
    pp.entryAmount0USD = BigDecimal.zero()
    pp.entryAmount1 = BigDecimal.zero()
    pp.entryAmount1USD = BigDecimal.zero()
    pp.entryAmountUSD = BigDecimal.zero()
    
    log.info("UNISWAP V3: Position {} created with ZERO entry amounts - will be set by event processing", [
      tokenId.toString()
    ])
  }
  // For existing positions, DO NOT overwrite entry data - it should be set by refreshUniV3PositionWithEventAmounts
  
  // Update current state (for both new and existing positions)
  pp.usdCurrent = usd
  pp.token0 = data.value2
  pp.token0Symbol = getTokenSymbol(data.value2)
  pp.amount0 = amount0Human
  pp.amount0USD = usd0
  pp.token1 = data.value3
  pp.token1Symbol = getTokenSymbol(data.value3)
  pp.amount1 = amount1Human
  pp.amount1USD = usd1
  pp.liquidity = data.value7
  
  // Check if position should be closed
  if (isPositionClosed(data.value7, amount0Human, amount1Human)) {
    pp.isActive = false
    pp.exitTxHash = txHash
    pp.exitTimestamp = block.timestamp
    pp.exitAmount0 = amount0Human
    pp.exitAmount0USD = usd0
    pp.exitAmount1 = amount1Human
    pp.exitAmount1USD = usd1
    pp.exitAmountUSD = usd
    
    // Remove from cache to prevent future swap updates
    removeAgentNFTFromPool("uniswap-v3", poolAddress, tokenId)
  }
  
  pp.save()

  // bubble up to AgentPortfolio
  refreshPortfolio(nftOwner, block)
}

// 3. Handle NFT transfers (add/remove from cache)
export function handleUniV3NFTTransferForCache(tokenId: BigInt, from: Address, to: Address): void {
  const mgr = NonfungiblePositionManager.bind(UNI_V3_MANAGER)
  const posResult = mgr.try_positions(tokenId)
  
  if (posResult.reverted) {
    log.error("UNISWAP V3: Failed to get position data for tokenId: {} in handleUniV3NFTTransferForCache", [tokenId.toString()])
    return
  }
  
  const pos = posResult.value
  
  // Derive pool address from position data with caching
  const poolAddress = getUniV3PoolAddress(pos.value2, pos.value3, pos.value4, tokenId)
  
  if (poolAddress.equals(Address.zero())) {
    log.error("UNISWAP V3: Failed to derive pool address for tokenId: {} in handleUniV3NFTTransferForCache", [tokenId.toString()])
    return
  }
  
  // Remove from cache if transferring out
  if (!from.equals(Address.zero())) {
    removeAgentNFTFromPool("uniswap-v3", poolAddress, tokenId)
  }
  
  // Add to cache if transferring in
  if (!to.equals(Address.zero())) {
    addAgentNFTToPool("uniswap-v3", poolAddress, tokenId)
  }
}
