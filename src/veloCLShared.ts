import { Address, BigDecimal, BigInt, ethereum, Bytes, log } from "@graphprotocol/graph-ts"
import { NonfungiblePositionManager } from "../generated/VeloNFTManager/NonfungiblePositionManager"
import { VelodromeCLPool }            from "../generated/templates/VeloCLPool/VelodromeCLPool"
import { VeloCLPool }                 from "../generated/templates"
import { LiquidityAmounts }           from "./libraries/LiquidityAmounts"
import { TickMath }                   from "./libraries/TickMath"
import { ProtocolPosition }           from "../generated/schema"
import { getUsd, refreshPortfolio }   from "./common"
import { addAgentNFTToPool, removeAgentNFTFromPool } from "./veloIndexCache"

const MANAGER = Address.fromString("0x416b433906b1B72FA758e166e239c43d68dC6F29")

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
  log.info("✅ VELODROME: Successfully got position data for tokenId: {}, pool: {}", [
    tokenId.toString(),
    pos.value11.toHexString()
  ])
  
  VeloCLPool.create(pos.value11)                // safe: duplicates ignored
  
  // Add to cache for swap tracking
  addAgentNFTToPool(pos.value11, tokenId)
}

// 2.  Re-price NFT into USD + persist
export function refreshVeloCLPosition(tokenId: BigInt, block: ethereum.Block): void {
  log.info("💎 VELODROME: Starting refreshVeloCLPosition for tokenId: {} at block: {}", [
    tokenId.toString(),
    block.number.toString()
  ])
  
  const mgr = NonfungiblePositionManager.bind(MANAGER)
  const dataResult = mgr.try_positions(tokenId)
  
  if (dataResult.reverted) {
    log.error("❌ VELODROME: Failed to get position data for tokenId: {} in refreshVeloCLPosition - call reverted", [tokenId.toString()])
    return
  }
  
  const data = dataResult.value
  log.info("💎 VELODROME: Position data - owner: {}, pool: {}, liquidity: {}", [
    data.value12.toHexString(),
    data.value11.toHexString(),
    data.value6.toString()
  ])

  // pool state
  const pool  = VelodromeCLPool.bind(data.value11)
  const slot0 = pool.slot0()

  log.info("💎 VELODROME: Pool slot0 - sqrtPriceX96: {}, tick: {}", [
    slot0.value0.toString(),
    slot0.value1.toString()
  ])

  // convert liquidity → token amounts
  const sqrtPa  = TickMath.getSqrtRatioAtTick(data.value4)
  const sqrtPb  = TickMath.getSqrtRatioAtTick(data.value5)
  const amounts = LiquidityAmounts.getAmountsForLiquidity(
                    slot0.value0, sqrtPa, sqrtPb, data.value6)

  log.info("💎 VELODROME: Token amounts - amount0: {}, amount1: {}", [
    amounts.amount0.toString(),
    amounts.amount1.toString()
  ])

  // USD pricing
  const usd0 = amounts.amount0.toBigDecimal()
                 .times(getUsd(data.value2, block))
                 .div(BigDecimal.fromString("1e" + pool.token0Decimals().toString()))
  const usd1 = amounts.amount1.toBigDecimal()
                 .times(getUsd(data.value3, block))
                 .div(BigDecimal.fromString("1e" + pool.token1Decimals().toString()))
  const usd  = usd0.plus(usd1)

  log.info("💎 VELODROME: USD values - token0: {} ({}), token1: {} ({}), total: {}", [
    data.value2.toHexString(),
    usd0.toString(),
    data.value3.toHexString(),
    usd1.toString(),
    usd.toString()
  ])

  // write ProtocolPosition
  const idString = data.value12.toHex() + "-" + tokenId.toString()
  const id = Bytes.fromHexString(idString)
  let pp = ProtocolPosition.load(id)
  let isNewPosition = false
  if (pp == null) {
    isNewPosition = true
    pp = new ProtocolPosition(id)
    pp.agent    = data.value12
    pp.protocol = "velodrome-cl"
    pp.pool     = data.value11
    log.info("💎 VELODROME: Creating NEW ProtocolPosition entity with id: {}", [idString])
  } else {
    log.info("💎 VELODROME: Updating EXISTING ProtocolPosition entity with id: {}", [idString])
  }
  
  pp.usdCurrent = usd
  pp.token0     = data.value2
  pp.amount0    = amounts.amount0.toBigDecimal()
  pp.token1     = data.value3
  pp.amount1    = amounts.amount1.toBigDecimal()
  pp.liquidity  = data.value6
  pp.save()

  log.info("💎 VELODROME: ProtocolPosition {} saved successfully - USD: {}", [
    isNewPosition ? "CREATED" : "UPDATED",
    usd.toString()
  ])

  // bubble up to AgentPortfolio
  refreshPortfolio(data.value12, block)
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
  
  // Remove from cache if transferring out
  if (!from.equals(Address.zero())) {
    log.info("📤 VELODROME: Removing tokenId: {} from pool: {} cache", [tokenId.toString(), pos.value11.toHexString()])
    removeAgentNFTFromPool(pos.value11, tokenId)
  }
  
  // Add to cache if transferring in
  if (!to.equals(Address.zero())) {
    log.info("📥 VELODROME: Adding tokenId: {} to pool: {} cache", [tokenId.toString(), pos.value11.toHexString()])
    addAgentNFTToPool(pos.value11, tokenId)
  }
}
