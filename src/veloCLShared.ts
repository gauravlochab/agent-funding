import { Address, BigDecimal, BigInt, ethereum, Bytes } from "@graphprotocol/graph-ts"
import { NonfungiblePositionManager } from "../generated/VeloNFTManager/NonfungiblePositionManager"
import { VelodromeCLPool }            from "../generated/templates/VeloCLPool/VelodromeCLPool"
import { VeloCLPool }                 from "../generated/templates"
import { LiquidityAmounts }           from "./libraries/LiquidityAmounts"
import { TickMath }                   from "./libraries/TickMath"
import { ProtocolPosition }           from "../generated/schema"
import { getUsd, refreshPortfolio }   from "./common"
import { addAgentNFTToPool, removeAgentNFTFromPool } from "./veloIndexCache"

const MANAGER = Address.fromString("0x4200000000000000000000000000000000000006")

// 1.  Spawn pool template the first time we meet an NFT
export function ensurePoolTemplate(tokenId: BigInt): void {
  const mgr = NonfungiblePositionManager.bind(MANAGER)
  const pos = mgr.positions(tokenId)
  VeloCLPool.create(pos.value11)                // safe: duplicates ignored
  
  // Add to cache for swap tracking
  addAgentNFTToPool(pos.value11, tokenId)
}

// 2.  Re-price NFT into USD + persist
export function refreshVeloCLPosition(tokenId: BigInt, block: ethereum.Block): void {
  const mgr  = NonfungiblePositionManager.bind(MANAGER)
  const data = mgr.positions(tokenId)

  // pool state
  const pool  = VelodromeCLPool.bind(data.value11)
  const slot0 = pool.slot0()

  // convert liquidity → token amounts
  const sqrtPa  = TickMath.getSqrtRatioAtTick(data.value4)
  const sqrtPb  = TickMath.getSqrtRatioAtTick(data.value5)
  const amounts = LiquidityAmounts.getAmountsForLiquidity(
                    slot0.value0, sqrtPa, sqrtPb, data.value6)

  // USD pricing
  const usd0 = amounts.amount0.toBigDecimal()
                 .times(getUsd(data.value2, block))
                 .div(BigDecimal.fromString("1e" + pool.token0Decimals().toString()))
  const usd1 = amounts.amount1.toBigDecimal()
                 .times(getUsd(data.value3, block))
                 .div(BigDecimal.fromString("1e" + pool.token1Decimals().toString()))
  const usd  = usd0.plus(usd1)

  // write ProtocolPosition
  const idString = data.value12.toHex() + "-" + tokenId.toString()
  const id = Bytes.fromHexString(idString)
  let pp = ProtocolPosition.load(id)
  if (pp == null) {
    pp = new ProtocolPosition(id)
    pp.agent    = data.value12
    pp.protocol = "velodrome-cl"
    pp.pool     = data.value11
  }
  pp.usdCurrent = usd
  pp.token0     = data.value2
  pp.amount0    = amounts.amount0.toBigDecimal()
  pp.token1     = data.value3
  pp.amount1    = amounts.amount1.toBigDecimal()
  pp.liquidity  = data.value6
  pp.save()

  // bubble up to AgentPortfolio
  refreshPortfolio(data.value12, block)
}

// 3. Handle NFT transfers (add/remove from cache)
export function handleNFTTransferForCache(tokenId: BigInt, from: Address, to: Address): void {
  const mgr = NonfungiblePositionManager.bind(MANAGER)
  const pos = mgr.positions(tokenId)
  
  // Remove from cache if transferring out
  if (!from.equals(Address.zero())) {
    removeAgentNFTFromPool(pos.value11, tokenId)
  }
  
  // Add to cache if transferring in
  if (!to.equals(Address.zero())) {
    addAgentNFTToPool(pos.value11, tokenId)
  }
}
