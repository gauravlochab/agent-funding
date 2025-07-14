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
import { isSafeOwnedNFT } from "./veloIndexCache"
import { log, Address, Bytes } from "@graphprotocol/graph-ts"
import { ProtocolPosition } from "../generated/schema"

const MANAGER = VELO_NFT_MANAGER

export function handleNFTTransfer(ev: Transfer): void {
  const incoming = isSafe(ev.params.to)
  const outgoing = isSafe(ev.params.from)

  if (!incoming && !outgoing) {
    return
  }

  if (incoming) {
    ensurePoolTemplate(ev.params.tokenId)
  }
  
  if (outgoing) {
    // Mark position as closed when NFT is transferred out
    const positionId = ev.params.from.toHex() + "-" + ev.params.tokenId.toString()
    const id = Bytes.fromHexString(positionId)
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
  // PHASE 1 OPTIMIZATION: Use cache instead of ownerOf() RPC call
  const isSafeOwned = isSafeOwnedNFT(ev.params.tokenId)
  
  if (isSafeOwned) {
    refreshVeloCLPosition(ev.params.tokenId, ev.block, ev.transaction.hash)
  }
}

export function handleDecreaseLiquidity(ev: DecreaseLiquidity): void {
  // PHASE 1 OPTIMIZATION: Use cache instead of ownerOf() RPC call
  const isSafeOwned = isSafeOwnedNFT(ev.params.tokenId)
  
  if (isSafeOwned) {
    refreshVeloCLPosition(ev.params.tokenId, ev.block, ev.transaction.hash)
  }
}

export function handleCollect(ev: Collect): void {
  // PHASE 1 OPTIMIZATION: Use cache instead of ownerOf() RPC call
  const isSafeOwned = isSafeOwnedNFT(ev.params.tokenId)
  
  if (isSafeOwned) {
    refreshVeloCLPosition(ev.params.tokenId, ev.block, ev.transaction.hash)
  }
}
