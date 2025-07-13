import { Address, BigDecimal, BigInt, ethereum, Bytes, log } from "@graphprotocol/graph-ts"
import { NonfungiblePositionManager } from "../generated/VeloNFTManager/NonfungiblePositionManager"
import { VelodromeCLPool }            from "../generated/templates/VeloCLPool/VelodromeCLPool"
import { VelodromeCLFactory }         from "../generated/VeloNFTManager/VelodromeCLFactory"
import { VeloCLPool }                 from "../generated/templates"
import { LiquidityAmounts }           from "./libraries/LiquidityAmounts"
import { TickMath }                   from "./libraries/TickMath"
import { ProtocolPosition }           from "../generated/schema"
import { getUsd, refreshPortfolio }   from "./common"
import { addAgentNFTToPool, removeAgentNFTFromPool } from "./veloIndexCache"

const MANAGER = Address.fromString("0x416b433906b1B72FA758e166e239c43d68dC6F29")
const FACTORY = Address.fromString("0x548118C7E0B865C2CfA94D15EC86B666468ac758")

// Helper function to derive pool address from position data
function getPoolAddress(token0: Address, token1: Address, tickSpacing: i32): Address {
  log.info("🔍 VELODROME: Deriving pool address for token0: {}, token1: {}, tickSpacing: {}", [
    token0.toHexString(),
    token1.toHexString(),
    tickSpacing.toString()
  ])
  
  const factory = VelodromeCLFactory.bind(FACTORY)
  const poolResult = factory.try_getPool(token0, token1, tickSpacing)
  
  if (poolResult.reverted) {
    log.error("❌ VELODROME: Failed to get pool from factory for tokens: {} / {}", [
      token0.toHexString(),
      token1.toHexString()
    ])
    return Address.zero()
  }
  
  const poolAddress = poolResult.value
  log.info("✅ VELODROME: Derived pool address: {} for tokens: {} / {}", [
    poolAddress.toHexString(),
    token0.toHexString(),
    token1.toHexString()
  ])
  
  return poolAddress
}

// 1.  Spawn pool template the first time we meet an NFT
export function ensurePoolTemplate(tokenId: BigInt): void {
  log.info("🔧 VELODROME: ensurePoolTemplate for tokenId: {}", [tokenId.toString()])
  
  const mgr = NonfungiblePositionManager.bind(MANAGER)
  const posResult = mgr.try_positions(tokenId)
  
  if (posResult.reverted) {
    log.error("❌ VELODROME: Failed to get position data for tokenId: {} - call reverted", [tokenId.toString()])
    return
  }
  
  const pos = posResult.value
  log.info("✅ VELODROME: Successfully got position data for tokenId: {}, token0: {}, token1: {}, tickSpacing: {}", [
    tokenId.toString(),
    pos.value2.toHexString(),  // token0
    pos.value3.toHexString(),  // token1
    pos.value4.toString()      // tickSpacing
  ])
  
  // Derive pool address from position data
  const poolAddress = getPoolAddress(pos.value2, pos.value3, pos.value4 as i32)
  
  if (poolAddress.equals(Address.zero())) {
    log.error("❌ VELODROME: Failed to derive pool address for tokenId: {}", [tokenId.toString()])
    return
  }
  
  log.info("🔧 VELODROME: Creating VeloCLPool template for pool: {}", [poolAddress.toHexString()])
  VeloCLPool.create(poolAddress)
  
  addAgentNFTToPool(poolAddress, tokenId)
  log.info("🔧 VELODROME: Pool template creation completed", [])
}

// 2.  Re-price NFT into USD + persist
export function refreshVeloCLPosition(tokenId: BigInt, block: ethereum.Block): void {
  log.info("💎 STARTING refreshVeloCLPosition for tokenId: {} at block: {}", [
    tokenId.toString(),
    block.number.toString()
  ])
  
  const mgr = NonfungiblePositionManager.bind(MANAGER)
  
  // First, get the actual NFT owner
  const ownerResult = mgr.try_ownerOf(tokenId)
  if (ownerResult.reverted) {
    log.error("❌ VELODROME: Failed to get owner for tokenId: {}", [tokenId.toString()])
    return
  }
  
  const nftOwner = ownerResult.value
  log.info("💎 VELODROME: NFT owner for tokenId: {} is: {}", [
    tokenId.toString(),
    nftOwner.toHexString()
  ])
  
  log.info("💎 VELODROME: Calling positions() for tokenId: {} on manager: {}", [
    tokenId.toString(),
    MANAGER.toHexString()
  ])
  
  const dataResult = mgr.try_positions(tokenId)
  
  if (dataResult.reverted) {
    log.error("❌ VELODROME: positions() call REVERTED for tokenId: {} - this should not happen for valid NFTs", [
      tokenId.toString()
    ])
    return
  }
  
  log.info("✅ VELODROME: positions() call SUCCESS for tokenId: {}", [tokenId.toString()])
  
  const data = dataResult.value
  // Velodrome positions() returns: nonce, operator, token0, token1, tickSpacing, tickLower, tickUpper, liquidity, ...
  // value0 = nonce, value1 = operator (owner), value2 = token0, value3 = token1, 
  // value4 = tickSpacing, value5 = tickLower, value6 = tickUpper, value7 = liquidity
  
  log.info("💎 VELODROME: Position data - owner: {}, token0: {}, token1: {}, liquidity: {}", [
    data.value1.toHexString(),  // operator (owner)
    data.value2.toHexString(),  // token0
    data.value3.toHexString(),  // token1
    data.value7.toString()      // liquidity
  ])

  // Derive pool address from position data
  const poolAddress = getPoolAddress(data.value2, data.value3, data.value4 as i32)
  
  if (poolAddress.equals(Address.zero())) {
    log.error("❌ VELODROME: Failed to derive pool address for tokenId: {}", [tokenId.toString()])
    return
  }
  
  log.info("💎 VELODROME: Using derived pool address: {} for token0: {}, token1: {}, tickSpacing: {}", [
    poolAddress.toHexString(),
    data.value2.toHexString(),
    data.value3.toHexString(),
    data.value4.toString()
  ])
  
  // pool state
  const pool  = VelodromeCLPool.bind(poolAddress)
  const slot0Result = pool.try_slot0()
  
  if (slot0Result.reverted) {
    log.error("❌ VELODROME: Failed to get slot0 from pool: {}", [poolAddress.toHexString()])
    return
  }
  
  const slot0 = slot0Result.value

  log.info("💎 VELODROME: Pool slot0 - sqrtPriceX96: {}, tick: {}", [
    slot0.value0.toString(),
    slot0.value1.toString()
  ])

  // convert liquidity → token amounts
  // Convert tick values to i32 for TickMath functions
  const tickLower = data.value5 as i32  // tickLower
  const tickUpper = data.value6 as i32  // tickUpper
  const currentTick = slot0.value1 as i32  // current tick from slot0
  
  // 🚨 CRITICAL DEBUG: Log tick range information
  log.warning("💎 VELODROME: Position ticks - tickLower: {}, tickUpper: {}, currentTick: {}", [
    tickLower.toString(),
    tickUpper.toString(),
    currentTick.toString()
  ])
  
  // Check if position is in range
  const inRange = currentTick >= tickLower && currentTick <= tickUpper
  log.warning("💎 VELODROME: Position range check - inRange: {}, current: {}, lower: {}, upper: {}", [
    inRange.toString(),
    currentTick.toString(),
    tickLower.toString(),
    tickUpper.toString()
  ])
  
  const sqrtPa  = TickMath.getSqrtRatioAtTick(tickLower)
  const sqrtPb  = TickMath.getSqrtRatioAtTick(tickUpper)
  
  // 🚨 CRITICAL DEBUG: Log sqrt ratios
  log.warning("💎 VELODROME: Sqrt ratios - sqrtPa: {}, sqrtPb: {}, sqrtPriceX96: {}", [
    sqrtPa.toString(),
    sqrtPb.toString(),
    slot0.value0.toString()
  ])
  
  const amounts = LiquidityAmounts.getAmountsForLiquidity(
                    slot0.value0, sqrtPa, sqrtPb, data.value7)  // liquidity

  log.warning("💎 VELODROME: Token amounts - amount0: {}, amount1: {} (liquidity: {})", [
    amounts.amount0.toString(),
    amounts.amount1.toString(),
    data.value7.toString()
  ])

  // USD pricing - USDC tokens have 6 decimals, not 18!
  // Both tokens in this pool are USDC variants with 6 decimals
  const token0Price = getUsd(data.value2, block)  // Should be $1.0 for USDC
  const token1Price = getUsd(data.value3, block)  // Should be $1.0 for USDC
  
  log.info("💎 VELODROME: Token prices - token0: {} (price: {}), token1: {} (price: {})", [
    data.value2.toHexString(),
    token0Price.toString(),
    data.value3.toHexString(),
    token1Price.toString()
  ])

  // Convert amounts from wei to human readable (6 decimals for USDC)
  const amount0Human = amounts.amount0.toBigDecimal().div(BigDecimal.fromString("1e6"))  // USDC has 6 decimals
  const amount1Human = amounts.amount1.toBigDecimal().div(BigDecimal.fromString("1e6"))  // USDC has 6 decimals
  
  const usd0 = amount0Human.times(token0Price)
  const usd1 = amount1Human.times(token1Price)
  const usd  = usd0.plus(usd1)
  
  log.info("💎 VELODROME: Human readable amounts - amount0: {} USDC, amount1: {} USDC", [
    amount0Human.toString(),
    amount1Human.toString()
  ])

  log.info("💎 VELODROME: USD values - token0: {} ({}), token1: {} ({}), total: {}", [
    data.value2.toHexString(),
    usd0.toString(),
    data.value3.toHexString(),
    usd1.toString(),
    usd.toString()
  ])

  // write ProtocolPosition - use actual NFT owner, not position data owner
  const idString = nftOwner.toHex() + "-" + tokenId.toString()  // Use actual NFT owner as agent
  const id = Bytes.fromHexString(idString)
  
  log.warning("💎 VELODROME: Creating/updating ProtocolPosition with ID: {} (using NFT owner: {})", [
    idString,
    nftOwner.toHexString()
  ])
  
  let pp = ProtocolPosition.load(id)
  let isNewPosition = false
  if (pp == null) {
    isNewPosition = true
    pp = new ProtocolPosition(id)
    pp.agent    = nftOwner         // Use actual NFT owner
    pp.protocol = "velodrome-cl"
    pp.pool     = poolAddress      // derived pool address
    log.warning("💎 VELODROME: Creating NEW ProtocolPosition entity with id: {}", [idString])
  } else {
    log.warning("💎 VELODROME: Updating EXISTING ProtocolPosition entity with id: {}", [idString])
  }
  
  pp.usdCurrent = usd
  pp.token0     = data.value2      // token0
  pp.amount0    = amount0Human     // Human readable amount (divided by 1e6)
  pp.token1     = data.value3      // token1
  pp.amount1    = amount1Human     // Human readable amount (divided by 1e6)
  pp.liquidity  = data.value7      // liquidity
  
  // Before save
  log.warning("💎 VELODROME: About to SAVE ProtocolPosition - USD: {}, agent: {}", [
    pp.usdCurrent.toString(),
    pp.agent.toHexString()
  ])
  
  pp.save()

  log.warning("💎 VELODROME: ProtocolPosition {} SAVED successfully - USD: {}", [
    isNewPosition ? "CREATED" : "UPDATED",
    pp.usdCurrent.toString()
  ])

  // bubble up to AgentPortfolio
  refreshPortfolio(nftOwner, block)  // Use actual NFT owner as agent
}

// 3. Handle NFT transfers (add/remove from cache)
export function handleNFTTransferForCache(tokenId: BigInt, from: Address, to: Address): void {
  log.info("🔄 VELODROME: handleNFTTransferForCache for tokenId: {}, from: {}, to: {}", [
    tokenId.toString(),
    from.toHexString(),
    to.toHexString()
  ])
  
  const mgr = NonfungiblePositionManager.bind(MANAGER)
  const posResult = mgr.try_positions(tokenId)
  
  if (posResult.reverted) {
    log.error("❌ VELODROME: Failed to get position data for tokenId: {} in handleNFTTransferForCache - call reverted", [tokenId.toString()])
    return
  }
  
  const pos = posResult.value
  
  // Derive pool address from position data
  const poolAddress = getPoolAddress(pos.value2, pos.value3, pos.value4 as i32)
  
  if (poolAddress.equals(Address.zero())) {
    log.error("❌ VELODROME: Failed to derive pool address for tokenId: {} in handleNFTTransferForCache", [tokenId.toString()])
    return
  }
  
  // Remove from cache if transferring out
  if (!from.equals(Address.zero())) {
    log.info("📤 VELODROME: Removing tokenId: {} from pool: {} cache", [tokenId.toString(), poolAddress.toHexString()])
    removeAgentNFTFromPool(poolAddress, tokenId)
  }
  
  // Add to cache if transferring in
  if (!to.equals(Address.zero())) {
    log.info("📥 VELODROME: Adding tokenId: {} to pool: {} cache", [tokenId.toString(), poolAddress.toHexString()])
    addAgentNFTToPool(poolAddress, tokenId)
  }
}
