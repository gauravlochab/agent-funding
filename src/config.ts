import { Address } from "@graphprotocol/graph-ts"

// =============================================================================
// CONFIGURATION - Update these addresses for different deployments
// =============================================================================

// Safe address to monitor
export const SAFE_ADDRESS = Address.fromString("0x9f3abfc3301093f39c2a137f87c525b4a0832ba9")
export const SAFE_ADDRESS_HEX = "0x9f3abfc3301093f39c2a137f87c525b4a0832ba9" // Lowercase for quick comparison

// Treasury/Whitelisted addresses
export const TREASURY_ADDRESSES: string[] = [
  "0x5da0ad7f4c888a61ec9d8d1c7121dc8f2e70fbd4"  // Treasury address (EOA for the safe)
]

// Token addresses (network-specific)
export const USDC_NATIVE = Address.fromString("0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85") // Native USDC on Optimism
export const USDC_BRIDGED = Address.fromString("0x7F5c764cBc14f9669B88837ca1490cCa17c31607") // USDC.e (Bridged) on Optimism

// Chainlink price feeds (network-specific)
export const ETH_USD_FEED = Address.fromString("0x13e3Ee699D1909E989722E753853AE30b17e08c5")
export const USDC_USD_FEED = Address.fromString("0x16a9FA2FDa030272Ce99B29CF780dFA30361E0f3")

// Other contract addresses
export const VELO_NFT_MANAGER = Address.fromString("0x416b433906b1B72FA758e166e239c43d68dC6F29")

// Agent validation function - only allow positions owned by the Safe
export function isValidAgent(address: Address): boolean {
  const addressHex = address.toHexString().toLowerCase()
  return addressHex == SAFE_ADDRESS_HEX.toLowerCase()
}
