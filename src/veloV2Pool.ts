import { 
  Mint,
  Burn,
  Sync,
  Transfer
} from "../generated/templates/VeloV2Pool/VelodromeV2Pool"

import { 
  refreshVeloV2PositionWithEventAmounts,
  refreshVeloV2PositionWithBurnAmounts,
  refreshVeloV2Position
} from "./veloV2Shared"

import { log } from "@graphprotocol/graph-ts"

// Handle VelodromeV2 Pool Mint events (liquidity additions)
export function handleVeloV2Mint(event: Mint): void {
  log.info("VELODROME V2: Mint event - pool: {}, sender: {}, amount0: {}, amount1: {}, txFrom: {}, txHash: {}, block: {}", [
    event.address.toHexString(),
    event.params.sender.toHexString(),
    event.params.amount0.toString(),
    event.params.amount1.toString(),
    event.transaction.from.toHexString(),
    event.transaction.hash.toHexString(),
    event.block.number.toString()
  ])
  
  // The sender in VelodromeV2 Mint events is typically the Router contract
  // We need to track the actual user who initiated the addLiquidity call
  // This is usually available in the transaction's from address
  const userAddress = event.transaction.from
  
  refreshVeloV2PositionWithEventAmounts(
    userAddress,
    event.address, // pool address
    event.block,
    event.params.amount0,
    event.params.amount1,
    event.transaction.hash
  )
}

// Handle VelodromeV2 Pool Burn events (liquidity removals)
export function handleVeloV2Burn(event: Burn): void {
  log.info("VELODROME V2: Burn event - pool: {}, sender: {}, to: {}, amount0: {}, amount1: {}, txFrom: {}, txHash: {}, block: {}", [
    event.address.toHexString(),
    event.params.sender.toHexString(),
    event.params.to.toHexString(),
    event.params.amount0.toString(),
    event.params.amount1.toString(),
    event.transaction.from.toHexString(),
    event.transaction.hash.toHexString(),
    event.block.number.toString()
  ])
  
  // The 'to' address is where the tokens are being sent (usually the user)
  // But we should also check the transaction from address
  const userAddress = event.transaction.from
  
  refreshVeloV2PositionWithBurnAmounts(
    userAddress,
    event.address, // pool address
    event.block,
    event.params.amount0,
    event.params.amount1,
    event.transaction.hash
  )
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
  // LP token transfers can indicate position changes
  // We care about transfers involving our Safe address
  
  const from = event.params.from
  const to = event.params.to
  const value = event.params.value
  
  log.info("VELODROME V2: Transfer event - pool: {}, from: {}, to: {}, value: {}, txFrom: {}, txHash: {}, block: {}", [
    event.address.toHexString(),
    from.toHexString(),
    to.toHexString(),
    value.toString(),
    event.transaction.from.toHexString(),
    event.transaction.hash.toHexString(),
    event.block.number.toString()
  ])
  
  // Handle minting (from zero address)
  if (from.toHexString() == "0x0000000000000000000000000000000000000000") {
    // This is a mint to the 'to' address
    refreshVeloV2Position(to, event.address, event.block, event.transaction.hash)
    return
  }
  
  // Handle burning (to zero address)
  if (to.toHexString() == "0x0000000000000000000000000000000000000000") {
    // This is a burn from the 'from' address
    refreshVeloV2Position(from, event.address, event.block, event.transaction.hash)
    return
  }
  
  // Handle regular transfers between addresses
  // Update both sender and receiver positions
  refreshVeloV2Position(from, event.address, event.block, event.transaction.hash)
  refreshVeloV2Position(to, event.address, event.block, event.transaction.hash)
}
