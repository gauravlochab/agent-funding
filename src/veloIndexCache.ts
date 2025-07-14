import { Address, BigInt, log } from "@graphprotocol/graph-ts"

// Simple in-memory cache to track which NFTs belong to which pools
// This helps the Swap handler know which NFTs to refresh
class PoolNFTCache {
  private poolToNFTs: Map<string, BigInt[]>
  private nftToPool: Map<string, string>  // tokenId -> poolAddress for reverse lookup

  constructor() {
    this.poolToNFTs = new Map<string, BigInt[]>()
    this.nftToPool = new Map<string, string>()
  }

  addNFTToPool(poolAddress: Address, tokenId: BigInt): void {
    let poolKey = poolAddress.toHexString()
    let tokenKey = tokenId.toString()
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
      this.nftToPool.set(tokenKey, poolKey)  // Add reverse lookup
      log.info("Added NFT {} to pool {} cache", [tokenId.toString(), poolKey])
    }
  }

  removeNFTFromPool(poolAddress: Address, tokenId: BigInt): void {
    let poolKey = poolAddress.toHexString()
    let tokenKey = tokenId.toString()
    
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
      this.nftToPool.delete(tokenKey)  // Remove reverse lookup
      log.info("Removed NFT {} from pool {} cache", [tokenId.toString(), poolKey])
    }
  }

  isNFTInCache(tokenId: BigInt): bool {
    let tokenKey = tokenId.toString()
    return this.nftToPool.has(tokenKey)
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

export function isSafeOwnedNFT(tokenId: BigInt): bool {
  // Use the reverse lookup to check if Safe owns this NFT
  // Since we only track Safe-owned NFTs in the cache, if it's found, Safe owns it
  
  log.info("🔍 CACHE CHECK: Checking if Safe owns tokenId: {}", [tokenId.toString()])
  
  const isOwned = cache.isNFTInCache(tokenId)
  
  log.info("🔍 CACHE RESULT: Safe owns tokenId {}: {}", [tokenId.toString(), isOwned.toString()])
  
  return isOwned
}
