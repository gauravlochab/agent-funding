import {
  IncreaseLiquidity,
  DecreaseLiquidity,
  Collect,
  Transfer,
  NonfungiblePositionManager
} from "../generated/VeloNFTManager/NonfungiblePositionManager"
import { VELO_NFT_MANAGER, getServiceByAgent } from "./config"
import { ensurePoolTemplate, refreshVeloCLPosition, refreshVeloCLPositionWithEventAmounts, handleNFTTransferForCache } from "./veloCLShared"
import { isSafeOwnedNFT } from "./poolIndexCache"
import { log, Address, Bytes } from "@graphprotocol/graph-ts"
import { ProtocolPosition } from "../generated/schema"

const MANAGER = VELO_NFT_MANAGER

export function handleNFTTransfer(ev: Transfer): void {
  const toService = getServiceByAgent(ev.params.to)
  const fromService = getServiceByAgent(ev.params.from)

  if (!toService && !fromService) {
    return
  }

  if (toService) {
    ensurePoolTemplate(ev.params.tokenId)
  }
  
  if (fromService) {
    // Mark position as closed when NFT is transferred out
    const positionId = ev.params.from.toHex() + "-" + ev.params.tokenId.toString()
    const id = Bytes.fromUTF8(positionId)
    let position = ProtocolPosition.load(id)
    
    if (position && position.isActive) {
      position.isActive = false
      position.exitTxHash = ev.transaction.hash
      position.exitTimestamp = ev.block.timestamp
      // Keep current amounts as final amounts
      position.exitAmount0 = position.amount0
      position.exitAmount0USD = position.amount0USD
      position.exitAmount1 = position.amount1
      position.exitAmount1USD = position.amount1USD
      position.exitAmountUSD = position.usdCurrent
      
      position.save()
    }
  }
  
  // Update cache
  handleNFTTransferForCache(ev.params.tokenId, ev.params.from, ev.params.to)
  
  refreshVeloCLPosition(ev.params.tokenId, ev.block, ev.transaction.hash)
}

export function handleIncreaseLiquidity(ev: IncreaseLiquidity): void {
  log.info("VELODROME: handleIncreaseLiquidity called for tokenId: {}, tx: {}", [
    ev.params.tokenId.toString(),
    ev.transaction.hash.toHexString()
  ])
  
  let shouldProcess = false
  
  // PHASE 1 OPTIMIZATION: Use cache instead of ownerOf() RPC call
  const isSafeOwned = isSafeOwnedNFT("velodrome-cl", ev.params.tokenId)
  
  log.info("VELODROME: isSafeOwned check result: {} for tokenId: {}", [
    isSafeOwned.toString(),
    ev.params.tokenId.toString()
  ])
  
  if (isSafeOwned) {
    shouldProcess = true
  } else {
    // FALLBACK: Check actual ownership for positions not in cache (existing positions)
    log.info("VELODROME: Cache miss for tokenId: {}, checking actual ownership", [
      ev.params.tokenId.toString()
    ])
    
    const mgr = NonfungiblePositionManager.bind(MANAGER)
    const ownerResult = mgr.try_ownerOf(ev.params.tokenId)
    
    if (!ownerResult.reverted && getServiceByAgent(ownerResult.value) != null) {
      shouldProcess = true
      log.info("VELODROME: Actual ownership confirmed for tokenId: {}, owner: {}", [
        ev.params.tokenId.toString(),
        ownerResult.value.toHexString()
      ])
      
      // Ensure pool template exists and populate cache for future
      ensurePoolTemplate(ev.params.tokenId)
    } else {
      log.info("VELODROME: Actual ownership check failed for tokenId: {}", [
        ev.params.tokenId.toString()
      ])
    }
  }
  
  if (shouldProcess) {
    log.info("VELODROME: Processing IncreaseLiquidity for tokenId: {}, amount0: {}, amount1: {}", [
      ev.params.tokenId.toString(),
      ev.params.amount0.toString(),
      ev.params.amount1.toString()
    ])
    
    // Use event amounts for accurate entry tracking
    refreshVeloCLPositionWithEventAmounts(
      ev.params.tokenId, 
      ev.block, 
      ev.params.amount0,
      ev.params.amount1,
      ev.transaction.hash
    )
  } else {
    log.info("VELODROME: Skipping IncreaseLiquidity for tokenId: {} - not owned by safe", [
      ev.params.tokenId.toString()
    ])
  }
}

export function handleDecreaseLiquidity(ev: DecreaseLiquidity): void {
  
  let shouldProcess = false
  
  // 1. Check cache first (fast path)
  const isSafeOwned = isSafeOwnedNFT("velodrome-cl", ev.params.tokenId)
  
  if (isSafeOwned) {
    shouldProcess = true
    
  } else {
    
    // 2. Final fallback: check actual ownership on-chain
    const mgr = NonfungiblePositionManager.bind(MANAGER)
    const ownerResult = mgr.try_ownerOf(ev.params.tokenId)
    
    if (!ownerResult.reverted) {
      const owner = ownerResult.value
      const ownerService = getServiceByAgent(owner)
      
      if (ownerService != null) {
        shouldProcess = true
        
        // Check for existing active position
        const positionId = owner.toHex() + "-" + ev.params.tokenId.toString()
        const id = Bytes.fromUTF8(positionId)
        const position = ProtocolPosition.load(id)
        
        if (position && position.isActive) {
          shouldProcess = true
        }
        
        // Ensure pool template exists and populate cache for future
        ensurePoolTemplate(ev.params.tokenId)
      }
    }
  }
  
  if (shouldProcess) {
    refreshVeloCLPosition(ev.params.tokenId, ev.block, ev.transaction.hash)
  }
}

export function handleCollect(ev: Collect): void {
  // PHASE 1 OPTIMIZATION: Use cache instead of ownerOf() RPC call
  const isSafeOwned = isSafeOwnedNFT("velodrome-cl", ev.params.tokenId)
  
  if (isSafeOwned) {
    refreshVeloCLPosition(ev.params.tokenId, ev.block, ev.transaction.hash)
  }
}
