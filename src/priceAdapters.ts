import { Address, BigDecimal, BigInt, log } from "@graphprotocol/graph-ts"
import { VelodromeCLPool } from "../generated/VeloNFTManager/VelodromeCLPool"
import { AggregatorV3Interface } from "../generated/Safe/AggregatorV3Interface"

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
  
  if (token.equals(token0)) {
    // Token is token0, get price in terms of token1
    let price = sqrtPriceToToken0Price(sqrtPriceX96, 6, 6) // Assuming 6 decimals for stablecoins
    return price.times(getPairTokenPrice(pairToken))
  } else if (token.equals(token1)) {
    // Token is token1, get price in terms of token0
    let price = sqrtPriceToToken1Price(sqrtPriceX96, 6, 6)
    return price.times(getPairTokenPrice(pairToken))
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
  // Get reference price for pair token
  // USDC, USDT, DAI = $1.00
  let stablecoins = [
    "0x0b2c639c533813f4aa9d7837caf62653d097ff85", // USDC
    "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58",  // USDT
    "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1"   // DAI
  ]
  
  let tokenHex = pairToken.toHexString().toLowerCase()
  for (let i = 0; i < stablecoins.length; i++) {
    if (tokenHex == stablecoins[i]) {
      return BigDecimal.fromString("1.0")
    }
  }
  
  // For WETH, use approximation (you could integrate with your existing getEthUsd)
  if (tokenHex == "0x4200000000000000000000000000000000000006") {
    return BigDecimal.fromString("3000.0") // Placeholder - ideally get from Chainlink
  }
  
  return BigDecimal.fromString("1.0") // Default fallback
}

function sqrtPriceToToken0Price(
  sqrtPriceX96: BigInt,
  token0Decimals: i32,
  token1Decimals: i32
): BigDecimal {
  // Convert sqrtPriceX96 to price
  let Q96 = BigDecimal.fromString("79228162514264337593543950336")
  let sqrtPrice = sqrtPriceX96.toBigDecimal().div(Q96)
  let price = sqrtPrice.times(sqrtPrice) // Square the sqrt price
  
  // Adjust for decimals
  let decimalDiff = token1Decimals - token0Decimals
  if (decimalDiff > 0) {
    let multiplier = BigDecimal.fromString("1")
    for (let i = 0; i < decimalDiff; i++) {
      multiplier = multiplier.times(BigDecimal.fromString("10"))
    }
    price = price.times(multiplier)
  } else if (decimalDiff < 0) {
    let divisor = BigDecimal.fromString("1")
    for (let i = 0; i < -decimalDiff; i++) {
      divisor = divisor.times(BigDecimal.fromString("10"))
    }
    price = price.div(divisor)
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
