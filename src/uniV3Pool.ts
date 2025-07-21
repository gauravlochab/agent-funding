// NOTE: This import will work once Uniswap V3 is added to subgraph.yaml and types are generated
import { Swap } from "../generated/templates/UniV3Pool/UniswapV3Pool"
import { getAgentNFTsInPool } from "./poolIndexCache"
import { refreshUniV3Position } from "./uniV3Shared"
import { ProtocolPosition } from "../generated/schema"
import { Address, Bytes, log } from "@graphprotocol/graph-ts"
import { SAFE_ADDRESS } from "./constants"

export function handleUniV3Swap(ev: Swap): void {
  const ids = getAgentNFTsInPool("uniswap-v3", ev.address)
  
  for (let i = 0; i < ids.length; i++) {
    const tokenId = ids[i]
    
    // Check if position is still active before updating
    const positionId = SAFE_ADDRESS.toHex() + "-" + tokenId.toString()
    const id = Bytes.fromHexString(positionId)
    const position = ProtocolPosition.load(id)
    
    if (position && position.isActive) {
      refreshUniV3Position(tokenId, ev.block, ev.transaction.hash)
    }
  }
}
