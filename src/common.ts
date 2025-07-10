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
  let result = addr.equals(SAFE_ADDRESS)
  log.info("isSafe check: address={}, safeAddress={}, result={}, txHash={}", [
    addr.toHexString(),
    SAFE_ADDRESS.toHexString(),
    result.toString(),
    txHash
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
