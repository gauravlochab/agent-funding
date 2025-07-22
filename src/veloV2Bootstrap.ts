import { 
  Sugar
} from "../generated/VeloV2Sugar/Sugar"
import {
  PoolFactory
} from "../generated/VeloV2Factory/PoolFactory"
import {
  PoolCreated as PoolCreatedEvent
} from "../generated/VeloV2Factory/PoolFactory"
import { 
  VeloV2Pool as VeloV2PoolTemplate 
} from "../generated/templates"
import { 
  Address, 
  BigInt,
  ethereum,
  log 
} from "@graphprotocol/graph-ts"

// Configuration
const SUGAR_ADDRESS = Address.fromString('0xA64db2D254f07977609def75c3A7db3eDc72EE1D')
const FACTORY_ADDRESS = Address.fromString('0xF1046053aa5682b4F9a81b5481394DA16BE5FF5a')

// Whitelisted tokens on Optimism (checksummed addresses)
const WHITELISTED_TOKENS: string[] = [
  '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85', // USDC (Native)
  '0xc40F949F8a4e094D1b49a23ea9241D289B7b2819', // LUSD  
  '0x4200000000000000000000000000000000000006', // WETH
  '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58', // TBTC
  '0x68f180fcCe6836688e9084f035309E29Bf0A2095', // WBTC
  '0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9', // sUSD
  '0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1', // DAI
]

// Cache to track discovered pools
let discoveredPools = new Map<string, boolean>()

function isTokenWhitelisted(tokenAddress: Address): boolean {
  let tokenString = tokenAddress.toHexString().toLowerCase()
  for (let i = 0; i < WHITELISTED_TOKENS.length; i++) {
    if (WHITELISTED_TOKENS[i].toLowerCase() == tokenString) {
      return true
    }
  }
  return false
}

function isPoolRelevant(token0: Address, token1: Address): boolean {
  return isTokenWhitelisted(token0) && isTokenWhitelisted(token1)
}

function createPoolTemplate(poolAddress: Address, token0: Address, token1: Address, stable: boolean): void {
  let poolKey = poolAddress.toHexString()
  
  // Check cache first
  if (discoveredPools.has(poolKey)) {
    log.warning("VELO V2 BOOTSTRAP: Pool {} already discovered, skipping", [poolKey])
    return
  }
  
  // Create template
  VeloV2PoolTemplate.create(poolAddress)
  discoveredPools.set(poolKey, true)
  
  log.warning("VELO V2 BOOTSTRAP: ✅ Created template for pool: {} ({}/{} stable:{})", [
    poolKey,
    token0.toHexString(),
    token1.toHexString(),
    stable.toString()
  ])
}

// Bootstrap handler - runs once at startup
export function handleVeloV2Bootstrap(block: ethereum.Block): void {
  log.warning("VELO V2 BOOTSTRAP: Starting pool discovery at block {} timestamp {}", [
    block.number.toString(),
    block.timestamp.toString()
  ])
  
  // Track timing
  let startTime = block.timestamp
  let batchCount = 0
  
  let sugar = Sugar.bind(SUGAR_ADDRESS)
  let totalDiscovered = 0
  let whitelistedFound = 0
  
  // Fetch pools in batches (Sugar contract MAX_LPS = 500)
  let limit = 500
  let offset = 0
  let hasMore = true
  
  while (hasMore) {
    batchCount++
    log.warning("VELO V2 BOOTSTRAP: Fetching batch {} - limit={}, offset={}", [
      batchCount.toString(),
      limit.toString(), 
      offset.toString()
    ])
    
    let batchStartTime = block.timestamp
    let poolsResult = sugar.try_all(BigInt.fromI32(limit), BigInt.fromI32(offset))
    
    if (poolsResult.reverted) {
      log.warning("VELO V2 BOOTSTRAP: Sugar contract call reverted at offset {}", [offset.toString()])
      break
    }
    
    let pools = poolsResult.value
    totalDiscovered += pools.length
    
    log.warning("VELO V2 BOOTSTRAP: Batch {} returned {} pools", [
      batchCount.toString(),
      pools.length.toString()
    ])
    
    if (pools.length == 0) {
      hasMore = false
      break
    }
    
    // Filter and create relevant pools
    for (let i = 0; i < pools.length; i++) {
      let poolData = pools[i]
      
      // IMPORTANT: Pool type mapping for VelodromeV2 (confirmed manually)
      // type 0 = stable pools
      // type -1 = volatile pools  
      // type 1 = concentrated liquidity pools (skip these)
      // Only track stable (0) and volatile (-1) pools
      if ([0,-1].includes(poolData.type) && isPoolRelevant(poolData.token0, poolData.token1)) {
        // Note: isStable is true when type is -1 (this is correct per manual verification)
        let isStable = poolData.type == -1
        createPoolTemplate(poolData.id, poolData.token0, poolData.token1, isStable)
        whitelistedFound++
        
        log.warning("VELO V2 BOOTSTRAP: Found relevant pool: {} ({}/{}) type: {}", [
          poolData.id.toHexString(),
          poolData.token0.toHexString(),
          poolData.token1.toHexString(),
          poolData.type.toString()
        ])
      }
    }
    
    // Check if we got fewer pools than requested (end of list)
    if (pools.length < limit) {
      hasMore = false
    } else {
      offset += limit
    }
  }
  
  // Calculate total time (note: in a subgraph we can't get actual time, just use block timestamp)
  let endTime = block.timestamp
  let totalBatches = batchCount
  
  log.warning("VELO V2 BOOTSTRAP: Discovery complete!", [])
  log.warning("VELO V2 BOOTSTRAP: Summary - Total pools: {}, Whitelisted pools: {}, Batches: {}", [
    totalDiscovered.toString(),
    whitelistedFound.toString(),
    totalBatches.toString()
  ])
  log.warning("VELO V2 BOOTSTRAP: Timing - Start: {}, End: {}, Block: {}", [
    startTime.toString(),
    endTime.toString(),
    block.number.toString()
  ])
}

// Factory event handler for new pools
export function handleVeloV2PoolCreated(event: PoolCreatedEvent): void {
  log.warning("VELO V2 FACTORY: New pool created: {} ({}/{} stable:{})", [
    event.params.pool.toHexString(),
    event.params.token0.toHexString(),
    event.params.token1.toHexString(),
    event.params.stable.toString()
  ])
  
  // Only create template if both tokens are whitelisted and not already discovered
  if (isPoolRelevant(event.params.token0, event.params.token1)) {
    let poolKey = event.params.pool.toHexString()
    
    if (!discoveredPools.has(poolKey)) {
      createPoolTemplate(event.params.pool, event.params.token0, event.params.token1, event.params.stable)
      
      log.warning("VELO V2 FACTORY: ✅ Created template for new relevant pool: {}", [
        event.params.pool.toHexString()
      ])
    } else {
      log.warning("VELO V2 FACTORY: Pool {} already exists, skipping", [poolKey])
    }
  } else {
    log.warning("VELO V2 FACTORY: Pool {} has non-whitelisted tokens, skipping", [
      event.params.pool.toHexString()
    ])
  }
}
