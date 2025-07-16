import { Address, BigDecimal, ethereum, log } from "@graphprotocol/graph-ts"
import { AggregatorV3Interface } from "../generated/Safe/AggregatorV3Interface"
import { AddressType } from "../generated/schema"
import { 
  SAFE_ADDRESS, 
  SAFE_ADDRESS_HEX, 
  TREASURY_ADDRESSES,
  USDC_NATIVE,
  USDC_BRIDGED,
  ETH_USD_FEED,
  USDC_USD_FEED
} from "./config"
import { getTokenPriceUSD } from "./priceDiscovery"

// — Whitelist & tokens (now imported from config)
export const WHITELIST: string[] = TREASURY_ADDRESSES

export const FUNDING_TOKENS: Address[] = [
  USDC_NATIVE, // Native USDC on Optimism
  USDC_BRIDGED  // USDC.e (Bridged) on Optimism
]

// 🚀 PERFORMANCE OPTIMIZATION: Ultra-fast Safe address check
export function isSafeQuick(addr: Address): boolean {
  return addr.toHexString().toLowerCase() == SAFE_ADDRESS_HEX
}

export function isWhitelisted(addr: Address, txHash: string = ""): boolean {
  // Convert address to checksum format for proper comparison
  let checksumAddr = addr.toHexString()
  let result = false
  
  // Check against whitelist with case-insensitive comparison
  for (let i = 0; i < WHITELIST.length; i++) {
    if (checksumAddr.toLowerCase() == WHITELIST[i].toLowerCase()) {
      result = true
      break
    }
  }
  
  return result
}

export function isEOA(addr: Address, block: ethereum.Block, txHash: string = ""): boolean {
  // Use the official Graph Protocol method to check if address has code
  let hasCode = ethereum.hasCode(addr).inner
  let isEOA = !hasCode // Invert: hasCode=true means contract, so isEOA=false
  
  return isEOA
}

// 🚀 PERFORMANCE OPTIMIZATION: Cached EOA check to avoid repeated RPC calls
export function isEOACached(addr: Address, block: ethereum.Block, txHash: string = ""): boolean {
  let addressId = addr
  let addressType = AddressType.load(addressId)
  
  if (addressType != null) {
    // Cache hit - return stored result (fast DB read)
    let isEOA = !addressType.isContract
    return isEOA
  }
  
  // Cache miss - check blockchain and store result (one-time RPC call)
  let hasCode = ethereum.hasCode(addr).inner
  let isContract = hasCode
  let isEOA = !isContract
  
  // Create and save cache entry
  addressType = new AddressType(addressId)
  addressType.isContract = isContract ? true : false
  addressType.checkedAt = block.number
  addressType.save()
  
  return isEOA
}

export function isFundingSource(addr: Address, block: ethereum.Block, txHash: string = ""): boolean {
  let whitelisted = isWhitelisted(addr, txHash)
  let eoa = isEOACached(addr, block, txHash) // 🚀 Using cached version for performance
  let result = whitelisted || eoa
  return result
}

export function isSafe(addr: Address, txHash: string = ""): boolean {
  let addrHex = addr.toHexString().toLowerCase()
  let safeHex = SAFE_ADDRESS.toHexString().toLowerCase()
  let result = addrHex == safeHex
  
  return result
}

function fetchFeedUsd(feed: Address): BigDecimal {
  let oracle = AggregatorV3Interface.bind(feed)
  let round = oracle.latestRoundData()
  return round.value1.toBigDecimal().div(BigDecimal.fromString("1e8"))
}

export function getEthUsd(_b: ethereum.Block): BigDecimal {
  return fetchFeedUsd(ETH_USD_FEED)
}

export function getUsdcUsd(_b: ethereum.Block): BigDecimal {
  return BigDecimal.fromString("1.0")
}

// Generic USD price function for any token
export function getUsd(token: Address, block: ethereum.Block): BigDecimal {
  // Use hardcoded pool pricing for all whitelisted tokens
  return getTokenPriceUSD(token, block.timestamp, false)
}

// Portfolio refresh function - placeholder for now
export function refreshPortfolio(agent: Address, block: ethereum.Block): void {
  // This would aggregate all protocol positions for an agent
  // In a full implementation, this would:
  // 1. Load all ProtocolPosition entities for this agent
  // 2. Sum up the USD values by protocol
  // 3. Update an AgentPortfolio entity
  // 4. Save the aggregated data
}
