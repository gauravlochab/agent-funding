import {
  IncreaseLiquidity,
  DecreaseLiquidity,
  Collect,
  Transfer,
  NonfungiblePositionManager
} from "../generated/VeloNFTManager/NonfungiblePositionManager"
import { isSafe } from "./common"
import { SAFE_ADDRESS, VELO_NFT_MANAGER } from "./config"
import { ensurePoolTemplate, refreshVeloCLPosition, handleNFTTransferForCache } from "./veloCLShared"
import { log, Address } from "@graphprotocol/graph-ts"

const MANAGER = VELO_NFT_MANAGER

export function handleNFTTransfer(ev: Transfer): void {
  log.info("🚨 NFT TRANSFER DETECTED: tokenId={}, from={}, to={}, block={}, tx={}", [
    ev.params.tokenId.toString(),
    ev.params.from.toHexString(), 
    ev.params.to.toHexString(),
    ev.block.number.toString(),
    ev.transaction.hash.toHexString()
  ])
  
  // Check for our specific target NFT
  if (ev.params.tokenId.toString() == "2894864") {
    log.warning("🎯 FOUND TARGET NFT 2894864! from={}, to={}", [
      ev.params.from.toHexString(),
      ev.params.to.toHexString()
    ])
  }
  
  log.info("🔄 VELODROME: NFT Transfer event detected - tokenId: {}, from: {}, to: {}", [
    ev.params.tokenId.toString(),
    ev.params.from.toHexString(),
    ev.params.to.toHexString()
  ])

  const incoming = isSafe(ev.params.to)
  const outgoing = isSafe(ev.params.from)

  log.info("🔍 SAFE CHECK RESULTS: incoming={}, outgoing={}, safeAddr={}", [
    incoming.toString(),
    outgoing.toString(),
    SAFE_ADDRESS.toHexString()
  ])

  if (!incoming && !outgoing) {
    log.info("❌ VELODROME: Skipping NFT Transfer - neither from nor to is Safe", [])
    return
  }

  if (incoming) {
    log.info("📥 VELODROME: NFT Transfer TO Safe - tokenId: {}, creating pool template", [ev.params.tokenId.toString()])
    ensurePoolTemplate(ev.params.tokenId)
  }
  
  if (outgoing) {
    log.info("📤 VELODROME: NFT Transfer FROM Safe - tokenId: {}", [ev.params.tokenId.toString()])
  }
  
  // Update cache
  handleNFTTransferForCache(ev.params.tokenId, ev.params.from, ev.params.to)
  
  log.info("🔄 VELODROME: Refreshing position for tokenId: {}", [ev.params.tokenId.toString()])
  refreshVeloCLPosition(ev.params.tokenId, ev.block)
}

export function handleIncreaseLiquidity(ev: IncreaseLiquidity): void {
  log.info("🚨 INCREASE LIQUIDITY DETECTED: tokenId={}, liquidity={}, block={}", [
    ev.params.tokenId.toString(),
    ev.params.liquidity.toString(),
    ev.block.number.toString()
  ])
  
  if (ev.params.tokenId.toString() == "2894864") {
    log.warning("🎯 FOUND TARGET NFT 2894864 IN INCREASE LIQUIDITY!", [])
  }
  
  // Get the owner from the NFT contract
  const mgr = NonfungiblePositionManager.bind(MANAGER)
  const ownerResult = mgr.try_ownerOf(ev.params.tokenId)
  
  if (ownerResult.reverted) {
    log.error("❌ VELODROME: Failed to get owner for tokenId: {}", [ev.params.tokenId.toString()])
    return
  }
  
  const owner = ownerResult.value
  log.info("🔍 VELODROME: IncreaseLiquidity owner check - tokenId: {}, owner: {}", [
    ev.params.tokenId.toString(),
    owner.toHexString()
  ])
  
  if (isSafe(owner)) {
    log.info("✅ VELODROME: Processing IncreaseLiquidity for Safe - tokenId: {}", [ev.params.tokenId.toString()])
    refreshVeloCLPosition(ev.params.tokenId, ev.block)
  } else {
    log.info("❌ VELODROME: Skipping IncreaseLiquidity - not Safe owner: {}", [owner.toHexString()])
  }
}

export function handleDecreaseLiquidity(ev: DecreaseLiquidity): void {
  log.info("🚨 DECREASE LIQUIDITY DETECTED: tokenId={}, liquidity={}", [
    ev.params.tokenId.toString(),
    ev.params.liquidity.toString()
  ])
  
  // Get the owner from the NFT contract
  const mgr = NonfungiblePositionManager.bind(MANAGER)
  const ownerResult = mgr.try_ownerOf(ev.params.tokenId)
  
  if (ownerResult.reverted) {
    log.error("❌ VELODROME: Failed to get owner for tokenId: {}", [ev.params.tokenId.toString()])
    return
  }
  
  const owner = ownerResult.value
  
  if (isSafe(owner)) {
    log.info("✅ VELODROME: Processing DecreaseLiquidity for Safe - tokenId: {}", [ev.params.tokenId.toString()])
    refreshVeloCLPosition(ev.params.tokenId, ev.block)
  } else {
    log.info("❌ VELODROME: Skipping DecreaseLiquidity - not Safe owner: {}", [owner.toHexString()])
  }
}

export function handleCollect(ev: Collect): void {
  log.info("🚨 COLLECT DETECTED: tokenId={}, amount0={}, amount1={}", [
    ev.params.tokenId.toString(),
    ev.params.amount0.toString(),
    ev.params.amount1.toString()
  ])
  
  // Get the owner from the NFT contract  
  const mgr = NonfungiblePositionManager.bind(MANAGER)
  const ownerResult = mgr.try_ownerOf(ev.params.tokenId)
  
  if (ownerResult.reverted) {
    log.error("❌ VELODROME: Failed to get owner for tokenId: {}", [ev.params.tokenId.toString()])
    return
  }
  
  const owner = ownerResult.value
  
  if (isSafe(owner)) {
    log.info("✅ VELODROME: Processing Collect for Safe - tokenId: {}", [ev.params.tokenId.toString()])
    refreshVeloCLPosition(ev.params.tokenId, ev.block)
  } else {
    log.info("❌ VELODROME: Skipping Collect - not Safe owner: {}", [owner.toHexString()])
  }
}
