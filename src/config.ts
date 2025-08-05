import { Address, Bytes } from "@graphprotocol/graph-ts"
import { Service } from "../generated/schema"

// =============================================================================
// DYNAMIC SERVICE CONFIGURATION - No hardcoded addresses
// =============================================================================

// Token addresses (network-specific) - Keep these as they're protocol tokens, not service-specific
export const USDC_NATIVE = Address.fromString("0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85") // Native USDC on Optimism
export const USDC_BRIDGED = Address.fromString("0x7F5c764cBc14f9669B88837ca1490cCa17c31607") // USDC.e (Bridged) on Optimism

// Chainlink price feeds (network-specific)
export const ETH_USD_FEED = Address.fromString("0x13e3Ee699D1909E989722E753853AE30b17e08c5")
export const USDC_USD_FEED = Address.fromString("0x16a9FA2FDa030272Ce99B29CF780dFA30361E0f3")

// Other contract addresses
export const VELO_NFT_MANAGER = Address.fromString("0x416b433906b1B72FA758e166e239c43d68dC6F29")

// OLAS-related addresses
export const OLAS_TOKEN = Address.fromString("0xFC2E6e6BCbd49ccf3A5f029c79984372DcBFE527")
export const STAKING_FACTORY = Address.fromString("0xa45E64d13A30a51b91ae0eb182e88a40e9b18eD8")

// Service lookup functions
export function getServiceByAgent(address: Address): Service | null {
  return Service.load(address)
}

export function isServiceAgent(address: Address): boolean {
  return getServiceByAgent(address) !== null
}

// Legacy function name for compatibility
export function isValidAgent(address: Address): boolean {
  return isServiceAgent(address)
}

// Get service by operator safe
export function getServiceByOperator(operator: Address): Service | null {
  // Note: This is not efficient in subgraphs as we can't query by field
  // In practice, we'll check if a specific service's operator matches
  // This is mainly used in funding logic where we already have the service
  return null
}

// Check if address is a service operator
export function isServiceOperator(address: Address): boolean {
  // This will be checked in context where we have a specific service
  return false
}
