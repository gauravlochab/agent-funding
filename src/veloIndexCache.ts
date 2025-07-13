import { Address, BigInt, log } from "@graphprotocol/graph-ts"

// Simple in-memory cache to track which NFTs belong to which pools
// This helps the Swap handler know which NFTs to refresh
class PoolNFTCache {
  private poolToNFTs: Map<string, BigInt[]>

  constructor() {
    this.poolToNFTs = new Map<string, BigInt[]>()
  }

  addNFTToPool(poolAddress: Address, tokenId: BigInt): void {
    let poolKey = poolAddress.toHexString()
    let nfts: BigInt[] = []
    
    // Check if key exists before getting
    if (this.poolToNFTs.has(poolKey)) {
      nfts = this.poolToNFTs.get(poolKey)
    }
    
    // Add if not already present
    let found = false
    for (let i = 0; i < nfts.length; i++) {
      if (nfts[i].equals(tokenId)) {
        found = true
        break
      }
    }
    
    if (!found) {
      nfts.push(tokenId)
      this.poolToNFTs.set(poolKey, nfts)
      log.info("Added NFT {} to pool {} cache", [tokenId.toString(), poolKey])
    }
  }

  removeNFTFromPool(poolAddress: Address, tokenId: BigInt): void {
    let poolKey = poolAddress.toHexString()
    
    // Check if key exists before getting
    if (this.poolToNFTs.has(poolKey)) {
      let nfts = this.poolToNFTs.get(poolKey)
      let newNfts: BigInt[] = []
      for (let i = 0; i < nfts.length; i++) {
        if (!nfts[i].equals(tokenId)) {
          newNfts.push(nfts[i])
        }
      }
      this.poolToNFTs.set(poolKey, newNfts)
      log.info("Removed NFT {} from pool {} cache", [tokenId.toString(), poolKey])
    }
  }

  getNFTsForPool(poolAddress: Address): BigInt[] {
    let poolKey = poolAddress.toHexString()
    
    // Check if key exists before getting
    if (this.poolToNFTs.has(poolKey)) {
      return this.poolToNFTs.get(poolKey)
    }
    
    return []
  }
}

// Global cache instance
let cache = new PoolNFTCache()

// Exported functions
export function addAgentNFTToPool(poolAddress: Address, tokenId: BigInt): void {
  cache.addNFTToPool(poolAddress, tokenId)
}

export function removeAgentNFTFromPool(poolAddress: Address, tokenId: BigInt): void {
  cache.removeNFTFromPool(poolAddress, tokenId)
}

export function getAgentNFTsInPool(poolAddress: Address): BigInt[] {
  return cache.getNFTsForPool(poolAddress)
}
