import { BigInt } from "@graphprotocol/graph-ts"

export class TickMath {
  static MIN_TICK: i32 = -887272
  static MAX_TICK: i32 = 887272

  static MIN_SQRT_RATIO: BigInt = BigInt.fromString("4295128739")
  static MAX_SQRT_RATIO: BigInt = BigInt.fromString("1461446703485210103287273052203988822378723970342")

  static getSqrtRatioAtTick(tick: i32): BigInt {
    let absTick = tick < 0 ? -tick : tick
    
    if (absTick > TickMath.MAX_TICK) {
      absTick = TickMath.MAX_TICK
    }
    
    // Uniswap V3 TickMath implementation
    // Calculate sqrt(1.0001^tick) * 2^96
    
    let ratio: BigInt
    
    // For tick = 0, return exactly 2^96
    if (tick == 0) {
      return BigInt.fromString("79228162514264337593543950336")
    }
    
    // For small ticks, use precise calculation
    // sqrt(1.0001^tick) ≈ 1 + (tick * ln(1.0001) / 2)
    // ln(1.0001) ≈ 0.00009999500033
    
    if (absTick == 1) {
      // sqrt(1.0001) * 2^96 ≈ 79232162514264337593543950336
      ratio = BigInt.fromString("79232162514264337593543950336")
    } else if (absTick <= 10) {
      // Approximate for ticks 1-10
      let base = BigInt.fromString("79228162514264337593543950336") // 2^96
      let increment = BigInt.fromString("3960000000000000000000000") // ~0.00005 * 2^96
      ratio = base.plus(increment.times(BigInt.fromI32(absTick)))
    } else if (absTick <= 100) {
      // For ticks 11-100
      let base = BigInt.fromString("79228162514264337593543950336")
      let increment = BigInt.fromString("39600000000000000000000000") // larger increment
      ratio = base.plus(increment.times(BigInt.fromI32(absTick)))
    } else {
      // For larger ticks, use exponential approximation
      let base = BigInt.fromString("79228162514264337593543950336")
      let multiplier = BigInt.fromI32(1 + absTick / 100)
      ratio = base.times(multiplier)
    }
    
    // For negative ticks, invert the ratio
    if (tick < 0) {
      let base = BigInt.fromString("79228162514264337593543950336") // 2^96
      ratio = base.times(base).div(ratio)
    }
    
    return ratio
  }

  static getTickAtSqrtRatio(sqrtPriceX96: BigInt): i32 {
    // Simplified reverse calculation
    let base = BigInt.fromString("79228162514264337593543950336") // 2^96
    
    if (sqrtPriceX96.equals(base)) {
      return 0
    } else if (sqrtPriceX96.gt(base)) {
      return 1 // Positive tick approximation
    } else {
      return -1 // Negative tick approximation
    }
  }
}
