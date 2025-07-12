import { Swap } from "../generated/templates/VeloCLPool/VelodromeCLPool"
import { getAgentNFTsInPool } from "./veloIndexCache"        // tiny util map
import { refreshVeloCLPosition } from "./veloCLShared"

export function handleSwap(ev: Swap): void {
  const ids = getAgentNFTsInPool(ev.address)                // BigInt[]
  for (let i = 0; i < ids.length; i++) {
    refreshVeloCLPosition(ids[i], ev.block)
  }
}
