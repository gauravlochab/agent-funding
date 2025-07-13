import { Address, BigDecimal, ethereum, log } from "@graphprotocol/graph-ts"
import { AggregatorV3Interface } from "../generated/Safe/AggregatorV3Interface"

// — Whitelist & tokens
export const WHITELIST: string[] = [
  "0x20274f94A2d61b04e485ACE1E03FC859Ad73789E"  // Treasury address
]

export const FUNDING_TOKENS: Address[] = [
  Address.fromString("0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85"), // Native USDC on Optimism
  Address.fromString("0x7F5c764cBc14f9669B88837ca1490cCa17c31607")  // USDC.e (Bridged) on Optimism
]

// — Chainlink feeds on Optimism
export const ETH_USD_FEED  = Address.fromString("0x13e3Ee699D1909E989722E753853AE30b17e08c5")
export const USDC_USD_FEED = Address.fromString("0x16a9FA2FDa030272Ce99B29CF780dFA30361E0f3")

// Safe address for detection
export const SAFE_ADDRESS = Address.fromString("0x5a4B31942d37d564e5cEf4C82340E43fe66686b2")
export const SAFE_ADDRESS_HEX = "0x5a4b31942d37d564e5cef4c82340e43fe66686b2" // Lowercase for quick comparison

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
