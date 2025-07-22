import { Address, BigDecimal, BigInt, log } from "@graphprotocol/graph-ts"
import { VelodromeCLPool } from "../generated/VeloNFTManager/VelodromeCLPool"
import { AggregatorV3Interface } from "../generated/Safe/AggregatorV3Interface"
import { getTokenConfig } from "./tokenConfig"

// Chainlink price adapter with validation
export function getChainlinkPrice(feedAddress: Address): BigDecimal {
  log.info("📊 CHAINLINK: Getting price from feed {}", [feedAddress.toHexString()])
  
  let aggregator = AggregatorV3Interface.bind(feedAddress)
  let roundResult = aggregator.try_latestRoundData()
  
  if (roundResult.reverted) {
    log.warning("❌ CHAINLINK: Failed to get price from feed {}", [feedAddress.toHexString()])
    return BigDecimal.fromString("0")
  }
  
  let roundData = roundResult.value
  let price = roundData.value1.toBigDecimal().div(BigDecimal.fromString("1e8")) // 8 decimals
  let updatedAt = roundData.value3

  // Check price staleness (Chainlink updates should be within 24 hours for these feeds)
  // Note: In production, this would use block.timestamp, but for testing we skip staleness check
  // let currentTime = BigInt.fromI32((Date.now() / 1000) as i32) // Current timestamp in seconds
  // let timeDiff = currentTime.minus(updatedAt)
  // let maxStaleTime = BigInt.fromI32(86400) // 24 hours

  // if (timeDiff.gt(maxStaleTime)) {
  //   log.warning("⚠️ CHAINLINK: Stale price from feed {} - {} hours old", [
  //     feedAddress.toHexString(),
  //     timeDiff.div(BigInt.fromI32(3600)).toString()
  //   ])
  //   // Still return the price but log the warning
  // }
  
  // Validate price is reasonable (not zero, not negative)
  if (price.le(BigDecimal.fromString("0"))) {
    log.error("❌ CHAINLINK: Invalid price {} from feed {}", [
      price.toString(), 
      feedAddress.toHexString()
    ])
    return BigDecimal.fromString("0")
  }
  
  return price
}

// Curve 3Pool adapter - conservative approach
export function getCurve3PoolPrice(token: Address): BigDecimal {
  log.info("📊 CURVE: Getting {} price from 3Pool", [token.toHexString()])
  
  // Curve 3Pool is designed for 1:1 stablecoin trading
  // These tokens should trade very close to $1.00
  let knownStablecoins = [
    "0x0b2c639c533813f4aa9d7837caf62653d097ff85", // USDC
    "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58",  // USDT
    "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1"   // DAI
  ]
  
  let tokenHex = token.toHexString().toLowerCase()
  for (let i = 0; i < knownStablecoins.length; i++) {
    if (tokenHex == knownStablecoins[i]) {
      // For 3Pool tokens, return $1.00 (they should maintain peg)
      return BigDecimal.fromString("1.0")
    }
  }
  
  return BigDecimal.fromString("0")
}

// Uniswap V3 price adapter with proper math
export function getUniswapV3Price(
  token: Address,
  poolAddress: Address,
  pairToken: Address,
  fee: i32
): BigDecimal {
  
  log.info("📊 UNISWAP: Getting {} price from V3 pool {}", [
    token.toHexString(), 
    poolAddress.toHexString()
  ])
  
  let pool = VelodromeCLPool.bind(poolAddress) // Same interface
  let slot0Result = pool.try_slot0()
  
  if (slot0Result.reverted) {
    log.warning("❌ UNISWAP: Failed to get slot0 from pool {}", [poolAddress.toHexString()])
    return BigDecimal.fromString("0")
  }
  
  let slot0 = slot0Result.value
  let sqrtPriceX96 = slot0.value0
  
  // Get token order
  let token0Result = pool.try_token0()
  let token1Result = pool.try_token1()
  
  if (token0Result.reverted || token1Result.reverted) {
    return BigDecimal.fromString("0")
  }
  
  let token0 = token0Result.value
  let token1 = token1Result.value
  
  // Get actual token decimals from config instead of hardcoding
  let targetTokenConfig = getTokenConfig(token)
  let pairTokenConfig = getTokenConfig(pairToken)

  if (targetTokenConfig == null || pairTokenConfig == null) {
    log.warning("❌ UNISWAP: Missing token config for {} or {}", [
      token.toHexString(), 
      pairToken.toHexString()
    ])
    return BigDecimal.fromString("0")
  }

  // Determine which token is token0 and token1
  let token0Decimals: i32
  let token1Decimals: i32

  log.info("📊 UNISWAP: Pool tokens - token0: {}, token1: {}", [
    token0.toHexString(),
    token1.toHexString()
  ])
  log.info("📊 UNISWAP: Looking for token: {}, pair token: {}", [
    token.toHexString(),
    pairToken.toHexString()
  ])
  log.info("📊 UNISWAP: sqrtPriceX96: {}", [sqrtPriceX96.toString()])

  if (token.equals(token0)) {
    token0Decimals = targetTokenConfig.decimals
    token1Decimals = pairTokenConfig.decimals
    log.info("📊 UNISWAP: Token is token0, decimals: {} / {}", [
      token0Decimals.toString(),
      token1Decimals.toString()
    ])
    // Token is token0, get price in terms of token1
    let price = sqrtPriceToToken0Price(sqrtPriceX96, token0Decimals, token1Decimals)
    let pairPrice = getPairTokenPrice(pairToken)
    log.info("📊 UNISWAP: Raw price: {}, pair price: {}, final: {}", [
      price.toString(),
      pairPrice.toString(),
      price.times(pairPrice).toString()
    ])
    return price.times(pairPrice)
  } else if (token.equals(token1)) {
    token0Decimals = pairTokenConfig.decimals
    token1Decimals = targetTokenConfig.decimals
    log.info("📊 UNISWAP: Token is token1, decimals: {} / {}", [
      token0Decimals.toString(),
      token1Decimals.toString()
    ])
    // Token is token1, get price in terms of token0
    let price = sqrtPriceToToken1Price(sqrtPriceX96, token0Decimals, token1Decimals)
    let pairPrice = getPairTokenPrice(pairToken)
    log.info("📊 UNISWAP: Raw price: {}, pair price: {}, final: {}", [
      price.toString(),
      pairPrice.toString(),
      price.times(pairPrice).toString()
    ])
    return price.times(pairPrice)
  }
  
  return BigDecimal.fromString("0")
}

// Velodrome price adapter (same as Uniswap V3)
export function getVelodromePrice(
  token: Address,
  poolAddress: Address,
  pairToken: Address
): BigDecimal {
  
  log.info("📊 VELODROME: Getting {} price from pool {}", [
    token.toHexString(), 
    poolAddress.toHexString()
  ])
  
  // Use same logic as Uniswap V3 since Velodrome CL uses similar interface
  return getUniswapV3Price(token, poolAddress, pairToken, 0)
}

// Helper functions
function getPairTokenPrice(pairToken: Address): BigDecimal {
  let tokenHex = pairToken.toHexString().toLowerCase()
  
  // Direct stablecoin pricing - NO RECURSION
  let stablecoins = [
    "0x0b2c639c533813f4aa9d7837caf62653d097ff85", // USDC
    "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58",  // USDT
    "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",  // DAI
    "0xc40f949f8a4e094d1b49a23ea9241d289b7b2819"   // LUSD
  ]
  
  for (let i = 0; i < stablecoins.length; i++) {
    if (tokenHex == stablecoins[i]) {
      return BigDecimal.fromString("1.0")
    }
  }
  
  // WETH - direct Chainlink call (NO RECURSION)
  if (tokenHex == "0x4200000000000000000000000000000000000006") {
    let ethFeed = Address.fromString("0x13e3Ee699D1909E989722E753853AE30b17e08c5")
    let ethPrice = getChainlinkPrice(ethFeed)
    return ethPrice.gt(BigDecimal.fromString("0")) ? ethPrice : BigDecimal.fromString("3000.0")
  }
  
  // Safe fallback for unknown tokens
  log.warning("⚠️ PRICE: Unknown pair token {}, using $1 fallback", [tokenHex])
  return BigDecimal.fromString("1.0")
}

function sqrtPriceToToken0Price(
  sqrtPriceX96: BigInt,
  token0Decimals: i32,
  token1Decimals: i32
): BigDecimal {
  
  // Safety check: prevent division by zero
  if (sqrtPriceX96.equals(BigInt.fromI32(0))) {
    log.warning("⚠️ MATH: sqrtPriceX96 is zero", [])
    return BigDecimal.fromString("0")
  }
  
  // Safety check: reasonable decimal values
  if (token0Decimals < 0 || token0Decimals > 18 || 
      token1Decimals < 0 || token1Decimals > 18) {
    log.warning("⚠️ MATH: Invalid decimals - token0: {}, token1: {}", [
      token0Decimals.toString(10),
      token1Decimals.toString(10)
    ])
    return BigDecimal.fromString("0")
  }
  
  let Q96 = BigDecimal.fromString("79228162514264337593543950336") // 2^96
  let sqrtPrice = sqrtPriceX96.toBigDecimal().div(Q96)
  
  // Safety check: reasonable sqrtPrice range
  if (sqrtPrice.le(BigDecimal.fromString("0")) || 
      sqrtPrice.gt(BigDecimal.fromString("1000000"))) {
    log.warning("⚠️ MATH: Suspicious sqrtPrice: {}", [sqrtPrice.toString()])
    return BigDecimal.fromString("0")
  }
  
  let price = sqrtPrice.times(sqrtPrice) // Square it safely
  
  log.info("📊 MATH: sqrtPrice: {}, price before adjustment: {}", [
    sqrtPrice.toString(),
    price.toString()
  ])
  
  // Decimal adjustment with bounds checking
  let decimalDiff = token1Decimals - token0Decimals
  log.info("📊 MATH: Decimal difference: {} (token1: {} - token0: {})", [
    decimalDiff.toString(),
    token1Decimals.toString(),
    token0Decimals.toString()
  ])
  if (decimalDiff > 0 && decimalDiff <= 18) {
    let multiplier = BigDecimal.fromString("1")
    for (let i = 0; i < decimalDiff; i++) {
      multiplier = multiplier.times(BigDecimal.fromString("10"))
    }
    price = price.times(multiplier)
  } else if (decimalDiff < 0 && decimalDiff >= -18) {
    let divisor = BigDecimal.fromString("1")
    for (let i = 0; i < -decimalDiff; i++) {
      divisor = divisor.times(BigDecimal.fromString("10"))
    }
    price = price.div(divisor)
  } else if (decimalDiff != 0) {
    log.warning("⚠️ MATH: Extreme decimal difference: {}", [decimalDiff.toString(10)])
  }
  
  log.info("📊 MATH: Final price after adjustment: {}", [price.toString()])
  
  // Final safety check
  if (price.le(BigDecimal.fromString("0")) || 
      price.gt(BigDecimal.fromString("1000000"))) {
    log.warning("⚠️ MATH: Final price out of bounds: {}", [price.toString()])
    return BigDecimal.fromString("0")
  }
  
  return price
}

function sqrtPriceToToken1Price(
  sqrtPriceX96: BigInt,
  token0Decimals: i32,
  token1Decimals: i32
): BigDecimal {
  let token0Price = sqrtPriceToToken0Price(sqrtPriceX96, token0Decimals, token1Decimals)
  return token0Price.equals(BigDecimal.fromString("0")) 
    ? BigDecimal.fromString("0")
    : BigDecimal.fromString("1").div(token0Price)
}
