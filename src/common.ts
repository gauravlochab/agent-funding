import { Address, BigDecimal, ethereum, log } from "@graphprotocol/graph-ts"
import { AggregatorV3Interface } from "../generated/Safe/AggregatorV3Interface"
import { 
  SAFE_ADDRESS, 
  SAFE_ADDRESS_HEX, 
  TREASURY_ADDRESSES,
  USDC_NATIVE,
  USDC_BRIDGED,
  ETH_USD_FEED,
  USDC_USD_FEED
} from "./config"

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
  
  log.info("isWhitelisted check: address={}, checksumAddr={}, result={}, whitelist={}, txHash={}", [
    addr.toHex(),
    checksumAddr,
    result.toString(),
    WHITELIST.join(","),
    txHash
  ])
  return result
}

export function isEOA(addr: Address, block: ethereum.Block, txHash: string = ""): boolean {
  // Use the official Graph Protocol method to check if address has code
  let hasCode = ethereum.hasCode(addr).inner
  let isEOA = !hasCode // Invert: hasCode=true means contract, so isEOA=false
  
  log.info("isEOA check: address={}, hasCode={}, isEOA={}, txHash={}", [
    addr.toHexString(),
    hasCode.toString(),
    isEOA.toString(),
    txHash
  ])
  
  return isEOA
}

export function isFundingSource(addr: Address, block: ethereum.Block, txHash: string = ""): boolean {
  let whitelisted = isWhitelisted(addr, txHash)
  let eoa = isEOA(addr, block, txHash)
  let result = whitelisted || eoa
  log.info("isFundingSource check: address={}, whitelisted={}, eoa={}, result={}, txHash={}", [
    addr.toHexString(),
    whitelisted.toString(),
    eoa.toString(),
    result.toString(),
    txHash
  ])
  return result
}

export function isSafe(addr: Address, txHash: string = ""): boolean {
  let addrHex = addr.toHexString().toLowerCase()
  let safeHex = SAFE_ADDRESS.toHexString().toLowerCase()
  let result = addrHex == safeHex
  
  log.info("🔍 isSafe check: input={}, safe={}, result={}, txHash={}", [
    addrHex, safeHex, result.toString(), txHash
  ])
  
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
  // For now, we'll implement basic price mapping
  // In a full implementation, you'd want to add more token price feeds
  
  // ETH (wrapped or native)
  if (token.toHexString().toLowerCase() == "0x4200000000000000000000000000000000000006" || // WETH on Optimism
      token.toHexString().toLowerCase() == "0x0000000000000000000000000000000000000000") {   // ETH
    return getEthUsd(block)
  }
  
  // USDC tokens
  if (token.equals(FUNDING_TOKENS[0]) || token.equals(FUNDING_TOKENS[1])) {
    return getUsdcUsd(block)
  }
  
  // Default to $1 for unknown tokens (should be extended with more price feeds)
  log.warning("Unknown token for USD pricing: {}, defaulting to $1", [token.toHexString()])
  return BigDecimal.fromString("1.0")
}

// Portfolio refresh function - placeholder for now
export function refreshPortfolio(agent: Address, block: ethereum.Block): void {
  // This would aggregate all protocol positions for an agent
  // For now, we'll just log that it was called
  log.info("refreshPortfolio called for agent: {} at block: {}", [
    agent.toHexString(),
    block.number.toString()
  ])
  
  // In a full implementation, this would:
  // 1. Load all ProtocolPosition entities for this agent
  // 2. Sum up the USD values by protocol
  // 3. Update an AgentPortfolio entity
  // 4. Save the aggregated data
}
