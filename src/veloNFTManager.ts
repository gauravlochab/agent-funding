import {
  IncreaseLiquidity,
  DecreaseLiquidity,
  Collect,
  Transfer
} from "../generated/VeloNFTManager/NonfungiblePositionManager"
import { isSafe } from "./common"
import { ensurePoolTemplate, refreshVeloCLPosition, handleNFTTransferForCache } from "./veloCLShared"

export function handleIncreaseLiquidity(ev: IncreaseLiquidity): void {
  if (isSafe(ev.params.owner)) refreshVeloCLPosition(ev.params.tokenId, ev.block)
}

export function handleDecreaseLiquidity(ev: DecreaseLiquidity): void {
  if (isSafe(ev.params.owner)) refreshVeloCLPosition(ev.params.tokenId, ev.block)
}

export function handleCollect(ev: Collect): void {
  if (isSafe(ev.params.owner)) refreshVeloCLPosition(ev.params.tokenId, ev.block)
}

export function handleNFTTransfer(ev: Transfer): void {
  const incoming = isSafe(ev.params.to)
  const outgoing = isSafe(ev.params.from)

  if (!incoming && !outgoing) return

  if (incoming) ensurePoolTemplate(ev.params.tokenId)       // first time we see pool
  
  // Update cache
  handleNFTTransferForCache(ev.params.tokenId, ev.params.from, ev.params.to)
  
  refreshVeloCLPosition(ev.params.tokenId, ev.block)        // sets USD=0 on exit
}
