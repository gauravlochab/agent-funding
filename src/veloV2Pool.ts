import { 
  Mint,
  Burn,
  Sync,
  Transfer
} from "../generated/templates/VeloV2Pool/VelodromeV2Pool"

import { 
  refreshVeloV2PositionWithEventAmounts,
  refreshVeloV2PositionWithBurnAmounts,
  refreshVeloV2Position,
  ensureVeloV2PoolTemplate
} from "./veloV2Shared"

import { log } from "@graphprotocol/graph-ts"
import { getServiceByAgent } from "./config"

// Handle VelodromeV2 Pool Mint events (liquidity additions)
export function handleVeloV2Mint(event: Mint): void {
  // We don't create positions from Mint events
  // Instead, we wait for the Transfer event to see who receives the LP tokens
  log.warning("VELODROME V2 MINT: Event triggered - pool: {}, sender: {}, amount0: {}, amount1: {}, txFrom: {}, txHash: {}, block: {}", [
    event.address.toHexString(),
    event.params.sender.toHexString(),
    event.params.amount0.toString(),
    event.params.amount1.toString(),
    event.transaction.from.toHexString(),
    event.transaction.hash.toHexString(),
    event.block.number.toString()
  ])
  
  log.warning("VELODROME V2 MINT: Waiting for Transfer event to determine LP token recipient", [])
}

// Handle VelodromeV2 Pool Burn events (liquidity removals)
export function handleVeloV2Burn(event: Burn): void {
  log.warning("===== VELODROME V2 BURN EVENT START =====", [])
  log.warning("VELODROME V2 BURN: Block: {}, TxHash: {}, Timestamp: {}", [
    event.block.number.toString(),
    event.transaction.hash.toHexString(),
    event.block.timestamp.toString()
  ])
  log.warning("VELODROME V2 BURN: Pool: {}, Sender: {}, To: {}", [
    event.address.toHexString(),
    event.params.sender.toHexString(),
    event.params.to.toHexString()
  ])
  log.warning("VELODROME V2 BURN: Raw amounts - amount0: {}, amount1: {}", [
    event.params.amount0.toString(),
    event.params.amount1.toString()
  ])
  log.warning("VELODROME V2 BURN: Transaction details - from: {}, to: {}", [
    event.transaction.from.toHexString(),
    event.transaction.to ? event.transaction.to!.toHexString() : "null"
  ])
  
  // The 'to' address is where the tokens are being sent (the actual user/recipient)
  // In VelodromeV2, the burn event's 'to' parameter indicates who receives the tokens
  const userAddress = event.params.to
  
  const userService = getServiceByAgent(userAddress)
  log.warning("VELODROME V2 BURN: Identified user address from burn event 'to' param: {} (Service: {})", [
    userAddress.toHexString(),
    userService != null ? "YES" : "NO"
  ])
  
  log.warning("VELODROME V2 BURN: For reference - tx.from: {}, burn.to: {}", [
    event.transaction.from.toHexString(),
    event.params.to.toHexString()
  ])
  
  if (userService != null) {
    log.warning("VELODROME V2 BURN: ✅ This burn is for a service - processing burn", [])
    
    refreshVeloV2PositionWithBurnAmounts(
      userAddress,
      event.address, // pool address
      event.block,
      event.params.amount0,
      event.params.amount1,
      event.transaction.hash
    )
    
    log.warning("VELODROME V2 BURN: ✅ Burn processing completed successfully", [])
  } else {
    log.warning("VELODROME V2 BURN: ❌ Burn is not for a service - skipping burn processing", [])
  }
  
  log.warning("===== VELODROME V2 BURN EVENT END =====", [])
}

// Handle VelodromeV2 Pool Sync events (pool state updates)
export function handleVeloV2Sync(event: Sync): void {
  // Sync events don't directly relate to user positions
  // but can be used for pool analytics if needed
  log.debug("VELODROME V2: Sync event - reserve0: {}, reserve1: {}", [
    event.params.reserve0.toString(),
    event.params.reserve1.toString()
  ])
  
  // For now, we don't need to do anything with Sync events
  // They're automatically handled when we refresh positions
}

// Handle VelodromeV2 Pool Transfer events (LP token transfers)
export function handleVeloV2Transfer(event: Transfer): void {
  const from = event.params.from
  const to = event.params.to
  const value = event.params.value
  
  log.warning("VELODROME V2 POOL: Transfer event - pool: {}, from: {}, to: {}, value: {}", [
    event.address.toHexString(),
    from.toHexString(),
    to.toHexString(),
    value.toString()
  ])
  
  // Handle minting (from zero address)
  if (from.toHexString() == "0x0000000000000000000000000000000000000000") {
    log.warning("VELODROME V2 POOL: LP tokens minted to {}", [to.toHexString()])
    refreshVeloV2Position(to, event.address, event.block, event.transaction.hash)
    return
  }
  
  // Handle burning (to zero address)
  if (to.toHexString() == "0x0000000000000000000000000000000000000000") {
    refreshVeloV2Position(from, event.address, event.block, event.transaction.hash)
    return
  }
  
  // Handle regular transfers between addresses
  refreshVeloV2Position(from, event.address, event.block, event.transaction.hash)
  refreshVeloV2Position(to, event.address, event.block, event.transaction.hash)
}
