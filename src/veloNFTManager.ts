import {
  IncreaseLiquidity,
  DecreaseLiquidity,
  Collect,
  Transfer
} from "../generated/VeloNFTManager/NonfungiblePositionManager"
import { isSafe } from "./common"
import { ensurePoolTemplate, refreshVeloCLPosition, handleNFTTransferForCache } from "./veloCLShared"
import { log } from "@graphprotocol/graph-ts"

export function handleIncreaseLiquidity(ev: IncreaseLiquidity): void {
  log.info("🔵 VELODROME: IncreaseLiquidity event detected - tokenId: {}, owner: {}, liquidity: {}", [
    ev.params.tokenId.toString(),
    ev.params.owner.toHexString(),
    ev.params.liquidity.toString()
  ])
  
  if (isSafe(ev.params.owner)) {
    log.info("✅ VELODROME: Processing IncreaseLiquidity for Safe - tokenId: {}", [ev.params.tokenId.toString()])
    refreshVeloCLPosition(ev.params.tokenId, ev.block)
  } else {
    log.info("❌ VELODROME: Skipping IncreaseLiquidity - not Safe owner: {}", [ev.params.owner.toHexString()])
  }
}

export function handleDecreaseLiquidity(ev: DecreaseLiquidity): void {
  log.info("🔴 VELODROME: DecreaseLiquidity event detected - tokenId: {}, owner: {}, liquidity: {}", [
    ev.params.tokenId.toString(),
    ev.params.owner.toHexString(),
    ev.params.liquidity.toString()
  ])
  
  if (isSafe(ev.params.owner)) {
    log.info("✅ VELODROME: Processing DecreaseLiquidity for Safe - tokenId: {}", [ev.params.tokenId.toString()])
    refreshVeloCLPosition(ev.params.tokenId, ev.block)
  } else {
    log.info("❌ VELODROME: Skipping DecreaseLiquidity - not Safe owner: {}", [ev.params.owner.toHexString()])
  }
}

export function handleCollect(ev: Collect): void {
  log.info("💰 VELODROME: Collect event detected - tokenId: {}, owner: {}, amount0: {}, amount1: {}", [
    ev.params.tokenId.toString(),
    ev.params.owner.toHexString(),
    ev.params.amount0.toString(),
    ev.params.amount1.toString()
  ])
  
  if (isSafe(ev.params.owner)) {
    log.info("✅ VELODROME: Processing Collect for Safe - tokenId: {}", [ev.params.tokenId.toString()])
    refreshVeloCLPosition(ev.params.tokenId, ev.block)
  } else {
    log.info("❌ VELODROME: Skipping Collect - not Safe owner: {}", [ev.params.owner.toHexString()])
  }
}

export function handleNFTTransfer(ev: Transfer): void {
  log.info("🔄 VELODROME: NFT Transfer event detected - tokenId: {}, from: {}, to: {}", [
    ev.params.tokenId.toString(),
    ev.params.from.toHexString(),
    ev.params.to.toHexString()
  ])
  
  const incoming = isSafe(ev.params.to)
  const outgoing = isSafe(ev.params.from)

  if (!incoming && !outgoing) {
    log.info("❌ VELODROME: Skipping NFT Transfer - neither from nor to is Safe", [])
    return
  }

  if (incoming) {
    log.info("📥 VELODROME: NFT Transfer TO Safe - tokenId: {}, creating pool template", [ev.params.tokenId.toString()])
    ensurePoolTemplate(ev.params.tokenId)       // first time we see pool
  }
  
  if (outgoing) {
    log.info("📤 VELODROME: NFT Transfer FROM Safe - tokenId: {}", [ev.params.tokenId.toString()])
  }
  
  // Update cache
  handleNFTTransferForCache(ev.params.tokenId, ev.params.from, ev.params.to)
  
  log.info("🔄 VELODROME: Refreshing position for tokenId: {}", [ev.params.tokenId.toString()])
  refreshVeloCLPosition(ev.params.tokenId, ev.block)        // sets USD=0 on exit
}
