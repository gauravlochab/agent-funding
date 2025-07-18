import { Address, BigDecimal, BigInt, ethereum, Bytes, log } from "@graphprotocol/graph-ts"
import { NonfungiblePositionManager } from "../generated/VeloNFTManager/NonfungiblePositionManager"
import { VelodromeCLPool }            from "../generated/templates/VeloCLPool/VelodromeCLPool"
import { VelodromeCLFactory }         from "../generated/VeloNFTManager/VelodromeCLFactory"
import { VeloCLPool }                 from "../generated/templates"
import { LiquidityAmounts }           from "./libraries/LiquidityAmounts"
import { TickMath }                   from "./libraries/TickMath"
import { ProtocolPosition }           from "../generated/schema"
import { getUsd, refreshPortfolio }   from "./common"
import { addAgentNFTToPool, removeAgentNFTFromPool, getCachedPoolAddress, cachePoolAddress } from "./poolIndexCache"
import { getTokenPriceUSD } from "./priceDiscovery"
import { VELO_MANAGER, VELO_FACTORY } from "./constants"

// Helper function to derive pool address from position data with caching
function getPoolAddress(token0: Address, token1: Address, tickSpacing: i32, tokenId: BigInt | null = null): Address {
  // Try cache first if we have a tokenId
  if (tokenId !== null) {
    const cached = getCachedPoolAddress("velodrome-cl", tokenId)
    if (cached !== null) {
      return cached
    }
  }
  
  // Try to get from existing ProtocolPosition if we have tokenId
  //if (tokenId !== null) {
    // We need to find the position by tokenId across all agents
    // This is a fallback - in practice the cache should hit first
    // For now, we'll proceed to factory call and cache the result
  //}
  
  // Factory call as last resort
  const factory = VelodromeCLFactory.bind(VELO_FACTORY)
  const poolResult = factory.try_getPool(token0, token1, tickSpacing)
  
  if (poolResult.reverted) {
    log.error("VELODROME: Failed to get pool from factory for tokens: {} / {}", [
      token0.toHexString(),
      token1.toHexString()
    ])
    return Address.zero()
  }
  
  const poolAddress = poolResult.value
  
  // Cache the result if we have a tokenId
  if (tokenId !== null) {
    cachePoolAddress("velodrome-cl", tokenId, poolAddress)
  }
  
  return poolAddress
}

// 1.  Spawn pool template the first time we meet an NFT
export function ensurePoolTemplate(tokenId: BigInt): void {
  const mgr = NonfungiblePositionManager.bind(VELO_MANAGER)
  const posResult = mgr.try_positions(tokenId)
  
  if (posResult.reverted) {
    log.error("VELODROME: Failed to get position data for tokenId: {}", [tokenId.toString()])
    return
  }
  
  const pos = posResult.value
  
  // Derive pool address from position data with caching
  const poolAddress = getPoolAddress(pos.value2, pos.value3, pos.value4 as i32, tokenId)
  
  if (poolAddress.equals(Address.zero())) {
    log.error("VELODROME: Failed to derive pool address for tokenId: {}", [tokenId.toString()])
    return
  }
  
  VeloCLPool.create(poolAddress)
  addAgentNFTToPool("velodrome-cl", poolAddress, tokenId)
}

// Helper function to check if position is closed
function isPositionClosed(liquidity: BigInt, amount0: BigDecimal, amount1: BigDecimal): boolean {
  const isLiquidityZero = liquidity.equals(BigInt.zero())
  const areAmountsZero = amount0.equals(BigDecimal.zero()) && amount1.equals(BigDecimal.zero())
    
  return isLiquidityZero || areAmountsZero
}

// 2.  Re-price NFT into USD + persist
export function refreshVeloCLPosition(tokenId: BigInt, block: ethereum.Block, txHash: Bytes = Bytes.empty()): void {
  const mgr = NonfungiblePositionManager.bind(VELO_MANAGER)
  
  // First, get the actual NFT owner
  const ownerResult = mgr.try_ownerOf(tokenId)
  if (ownerResult.reverted) {
    log.error("VELODROME: Failed to get owner for tokenId: {}", [tokenId.toString()])
    return
  }
  
  const nftOwner = ownerResult.value

  // Early check - don't process closed positions
  const idString = nftOwner.toHex() + "-" + tokenId.toString()
  const id = Bytes.fromUTF8(idString)
  let position = ProtocolPosition.load(id)
  
  if (position && !position.isActive) {
    return
  }
  
  const dataResult = mgr.try_positions(tokenId)
  
  if (dataResult.reverted) {
    log.error("VELODROME: positions() call failed for tokenId: {}", [tokenId.toString()])
    return
  }
  
  const data = dataResult.value

  // Derive pool address from position data with caching
  const poolAddress = getPoolAddress(data.value2, data.value3, data.value4 as i32, tokenId)
  
  if (poolAddress.equals(Address.zero())) {
    log.error("VELODROME: Failed to derive pool address for tokenId: {}", [tokenId.toString()])
    return
  }
  
  // pool state
  const pool  = VelodromeCLPool.bind(poolAddress)
  const slot0Result = pool.try_slot0()
  
  if (slot0Result.reverted) {
    log.error("VELODROME: Failed to get slot0 from pool: {}", [poolAddress.toHexString()])
    return
  }
  
  const slot0 = slot0Result.value

  // convert liquidity → token amounts
  const tickLower = data.value5 as i32
  const tickUpper = data.value6 as i32
  
  const sqrtPa  = TickMath.getSqrtRatioAtTick(tickLower)
  const sqrtPb  = TickMath.getSqrtRatioAtTick(tickUpper)
  
  const amounts = LiquidityAmounts.getAmountsForLiquidity(
                    slot0.value0, sqrtPa, sqrtPb, data.value7)

  // USD pricing - NEW HARDCODED VERSION
  const token0Price = getTokenPriceUSD(data.value2, block.timestamp, false) // token0
  const token1Price = getTokenPriceUSD(data.value3, block.timestamp, false) // token1

  // Convert amounts from wei to human readable (6 decimals for USDC)
  const amount0Human = amounts.amount0.toBigDecimal().div(BigDecimal.fromString("1e6"))
  const amount1Human = amounts.amount1.toBigDecimal().div(BigDecimal.fromString("1e6"))
  
  const usd0 = amount0Human.times(token0Price)
  const usd1 = amount1Human.times(token1Price)
  const usd  = usd0.plus(usd1)

  // write ProtocolPosition - use actual NFT owner, not position data owner
  let pp = ProtocolPosition.load(id)
  const isNewPosition = pp == null
  
  if (pp == null) {
    pp = new ProtocolPosition(id)
    pp.agent    = nftOwner
    pp.protocol = "velodrome-cl"
    pp.pool     = poolAddress
    pp.tokenId  = tokenId
    pp.isActive = true
    
    // Set static position metadata (required fields)
    pp.tickLower = tickLower
    pp.tickUpper = tickUpper
    pp.tickSpacing = data.value4
    
    // Set entry data for new positions
    pp.entryTxHash = txHash
    pp.entryTimestamp = block.timestamp
    pp.entryAmount0 = amount0Human
    pp.entryAmount0USD = usd0
    pp.entryAmount1 = amount1Human
    pp.entryAmount1USD = usd1
    pp.entryAmountUSD = usd
  }
  
  // Update current state (for both new and existing positions)
  pp.usdCurrent = usd
  pp.token0     = data.value2
  pp.amount0    = amount0Human
  pp.amount0USD = usd0
  pp.token1     = data.value3
  pp.amount1    = amount1Human
  pp.amount1USD = usd1
  pp.liquidity  = data.value7
  
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
    removeAgentNFTFromPool("velodrome-cl", poolAddress, tokenId)
  }
  
  pp.save()

  // bubble up to AgentPortfolio
  refreshPortfolio(nftOwner, block)
}

// 3. Handle NFT transfers (add/remove from cache)
export function handleNFTTransferForCache(tokenId: BigInt, from: Address, to: Address): void {
  const mgr = NonfungiblePositionManager.bind(VELO_MANAGER)
  const posResult = mgr.try_positions(tokenId)
  
  if (posResult.reverted) {
    log.error("VELODROME: Failed to get position data for tokenId: {} in handleNFTTransferForCache", [tokenId.toString()])
    return
  }
  
  const pos = posResult.value
  
  // Derive pool address from position data with caching
  const poolAddress = getPoolAddress(pos.value2, pos.value3, pos.value4 as i32, tokenId)
  
  if (poolAddress.equals(Address.zero())) {
    log.error("VELODROME: Failed to derive pool address for tokenId: {} in handleNFTTransferForCache", [tokenId.toString()])
    return
  }
  
  // Remove from cache if transferring out
  if (!from.equals(Address.zero())) {
    removeAgentNFTFromPool("velodrome-cl", poolAddress, tokenId)
  }
  
  // Add to cache if transferring in
  if (!to.equals(Address.zero())) {
    addAgentNFTToPool("velodrome-cl", poolAddress, tokenId)
  }
}
