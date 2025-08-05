import { BigDecimal, BigInt, Address, log } from "@graphprotocol/graph-ts"
import { AggregatorV3Interface } from "../generated/Safe/AggregatorV3Interface"
import { ETH_USD_FEED } from "./config"

// OLAS/ETH ratio from Ethereum mainnet data
const OLAS_ETH_RATIO = BigDecimal.fromString("0.0001064")

// Fallback price if ETH price unavailable
const FALLBACK_OLAS_PRICE = BigDecimal.fromString("0.24")

// Price validation range
const MIN_OLAS_PRICE = BigDecimal.fromString("0.05")
const MAX_OLAS_PRICE = BigDecimal.fromString("5.00")

/**
 * Get current OLAS price in USD using ETH-derived pricing
 * @param timestamp Block timestamp (for logging purposes)
 * @returns OLAS price in USD
 */
export function getOlasPrice(timestamp: BigInt): BigDecimal {
  log.info("OLAS_PRICE: Getting OLAS price at timestamp {}", [timestamp.toString()])
  
  // Get ETH/USD price from Chainlink
  let ethPriceUSD = getETHPriceUSD()
  
  if (ethPriceUSD.equals(BigDecimal.zero())) {
    log.warning("OLAS_PRICE: ETH price unavailable, using fallback price ${}", [FALLBACK_OLAS_PRICE.toString()])
    return FALLBACK_OLAS_PRICE
  }
  
  // Calculate OLAS price: ETH_USD * OLAS_ETH_RATIO
  let olasPrice = ethPriceUSD.times(OLAS_ETH_RATIO)
  
  // Validate price range
  if (olasPrice.lt(MIN_OLAS_PRICE) || olasPrice.gt(MAX_OLAS_PRICE)) {
    log.warning("OLAS_PRICE: Calculated price ${} outside valid range (${}-${}), using fallback", [
      olasPrice.toString(),
      MIN_OLAS_PRICE.toString(),
      MAX_OLAS_PRICE.toString()
    ])
    return FALLBACK_OLAS_PRICE
  }
  
  log.info("OLAS_PRICE: ETH=${}, OLAS/ETH={}, OLAS=${}", [
    ethPriceUSD.toString(),
    OLAS_ETH_RATIO.toString(),
    olasPrice.toString()
  ])
  
  return olasPrice
}

/**
 * Convert OLAS amount in wei to USD
 * @param olasAmountWei OLAS amount in wei (18 decimals)
 * @param timestamp Block timestamp
 * @returns USD value
 */
export function convertOlasToUSD(olasAmountWei: BigInt, timestamp: BigInt): BigDecimal {
  if (olasAmountWei.equals(BigInt.zero())) {
    return BigDecimal.zero()
  }
  
  // Convert wei to OLAS (18 decimals)
  let olasAmount = olasAmountWei.toBigDecimal().div(BigDecimal.fromString("1000000000000000000"))
  
  // Get OLAS price in USD
  let olasPrice = getOlasPrice(timestamp)
  
  // Calculate USD value
  let usdValue = olasAmount.times(olasPrice)
  
  log.info("OLAS_PRICE: {} OLAS (wei: {}) = ${} USD", [
    olasAmount.toString(),
    olasAmountWei.toString(),
    usdValue.toString()
  ])
  
  return usdValue
}

/**
 * Get ETH/USD price from Chainlink oracle
 * @returns ETH price in USD, or zero if unavailable
 */
function getETHPriceUSD(): BigDecimal {
  let ethFeed = AggregatorV3Interface.bind(ETH_USD_FEED)
  
  // Try to get latest round data
  let latestRoundCall = ethFeed.try_latestRoundData()
  
  if (latestRoundCall.reverted) {
    log.warning("OLAS_PRICE: Failed to get ETH price from Chainlink feed {}", [ETH_USD_FEED.toHexString()])
    return BigDecimal.zero()
  }
  
  let roundData = latestRoundCall.value
  let price = roundData.value1 // answer
  let decimals = ethFeed.try_decimals()
  
  if (decimals.reverted) {
    log.warning("OLAS_PRICE: Failed to get decimals from ETH feed", [])
    return BigDecimal.zero()
  }
  
  // Convert price to BigDecimal with proper decimals
  let divisor = BigInt.fromI32(10).pow(decimals.value as u8)
  let ethPrice = price.toBigDecimal().div(divisor.toBigDecimal())
  
  // Basic validation - ETH should be between $100 and $10,000
  if (ethPrice.lt(BigDecimal.fromString("100")) || ethPrice.gt(BigDecimal.fromString("10000"))) {
    log.warning("OLAS_PRICE: ETH price ${} seems invalid, ignoring", [ethPrice.toString()])
    return BigDecimal.zero()
  }
  
  log.info("OLAS_PRICE: ETH price from Chainlink: ${}", [ethPrice.toString()])
  return ethPrice
}

/**
 * Update running average price for better USD accuracy
 * @param currentAverage Current average price
 * @param newPrice New price to incorporate
 * @param weight Weight for new price (0.1 = 10% weight)
 * @returns Updated average price
 */
export function updateAveragePrice(currentAverage: BigDecimal, newPrice: BigDecimal, weight: BigDecimal): BigDecimal {
  if (currentAverage.equals(BigDecimal.zero())) {
    return newPrice
  }
  
  // Weighted average: (1-weight) * old + weight * new
  let oneMinusWeight = BigDecimal.fromString("1").minus(weight)
  let newAverage = currentAverage.times(oneMinusWeight).plus(newPrice.times(weight))
  
  log.info("OLAS_PRICE: Updated average: {} -> {} (new price: {}, weight: {})", [
    currentAverage.toString(),
    newAverage.toString(),
    newPrice.toString(),
    weight.toString()
  ])
  
  return newAverage
}
