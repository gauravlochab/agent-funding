import { Swap } from "../generated/templates/VeloCLPool/VelodromeCLPool"
import { getAgentNFTsInPool } from "./veloIndexCache"        // tiny util map
import { refreshVeloCLPosition } from "./veloCLShared"
import { ProtocolPosition } from "../generated/schema"
import { Address, Bytes, log } from "@graphprotocol/graph-ts"
import { SAFE_ADDRESS } from "./config"

export function handleSwap(ev: Swap): void {
  const ids = getAgentNFTsInPool(ev.address)                // BigInt[]
  
  for (let i = 0; i < ids.length; i++) {
    const tokenId = ids[i]
    
    // Check if position is still active before updating
    const positionId = SAFE_ADDRESS.toHex() + "-" + tokenId.toString()
    const id = Bytes.fromHexString(positionId)
    const position = ProtocolPosition.load(id)
    
    if (position && position.isActive) {
      refreshVeloCLPosition(tokenId, ev.block, ev.transaction.hash)
    }
  }
}
