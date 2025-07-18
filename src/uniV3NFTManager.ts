// NOTE: These imports will work once Uniswap V3 is added to subgraph.yaml and types are generated
import { 
  IncreaseLiquidity, 
  DecreaseLiquidity, 
  Collect, 
  Transfer 
} from "../generated/UniV3NFTManager/NonfungiblePositionManager"
import { ensureUniV3PoolTemplate, refreshUniV3Position } from "./uniV3Shared"

export function handleUniV3IncreaseLiquidity(event: IncreaseLiquidity): void {
  ensureUniV3PoolTemplate(event.params.tokenId)
  refreshUniV3Position(event.params.tokenId, event.block, event.transaction.hash)
}

export function handleUniV3DecreaseLiquidity(event: DecreaseLiquidity): void {
  refreshUniV3Position(event.params.tokenId, event.block, event.transaction.hash)
}

export function handleUniV3Collect(event: Collect): void {
  refreshUniV3Position(event.params.tokenId, event.block, event.transaction.hash)
}

export function handleUniV3Transfer(event: Transfer): void {
  refreshUniV3Position(event.params.tokenId, event.block, event.transaction.hash)
}
