import { Address, BigDecimal, BigInt, log, Bytes } from "@graphprotocol/graph-ts"
import { Token, PriceSource, PriceUpdate } from "../generated/schema"
import { getTokenConfig, TokenConfig, PriceSourceConfig } from "./tokenConfig"

// Cache duration: 5 minutes
const PRICE_CACHE_DURATION = BigInt.fromI32(300)
const MIN_CONFIDENCE_THRESHOLD = BigDecimal.fromString("0.5") // 50% minimum confidence

// Simplified token validation without caching to avoid Map issues
function isTokenValidated(address: Address): boolean {
  // Direct validation without caching - simpler and safer
  let config = getTokenConfig(address)
  return config != null
}

export function getTokenPriceUSD(
  tokenAddress: Address,
  currentTimestamp: BigInt,
  forceRefresh: boolean = false
): BigDecimal {
  
  // Quick validation check first
  if (!isTokenValidated(tokenAddress)) {
    log.error("🚫 PRICE: Token not in whitelist: {}", [tokenAddress.toHexString()])
    return BigDecimal.fromString("0")
  }

  let token = Token.load(tokenAddress)
  if (token == null) {
    token = initializeToken(tokenAddress)
    if (token == null) {
      return BigDecimal.fromString("0")
    }
  }
  
  // Check cache
  if (!forceRefresh && 
      currentTimestamp.minus(token.lastPriceUpdate).lt(PRICE_CACHE_DURATION) &&
      token.priceConfidence.gt(MIN_CONFIDENCE_THRESHOLD)) {
    log.info("💾 PRICE: Using cached price for {} = ${} (confidence: {}%)", [
      token.symbol, 
      token.derivedUSD.toString(),
      token.priceConfidence.times(BigDecimal.fromString("100")).toString()
    ])
    return token.derivedUSD
  }
  
  // Get fresh price from sources
  let priceResult = getPriceFromSources(token, currentTimestamp)
  
  if (priceResult.price.gt(BigDecimal.fromString("0")) && 
      priceResult.confidence.gt(MIN_CONFIDENCE_THRESHOLD)) {
    
    // Update token with new price
    token.derivedUSD = priceResult.price
    token.priceConfidence = priceResult.confidence
    token.lastPriceUpdate = currentTimestamp
    token.save()
    
    // Create price update record
    createPriceUpdate(token, priceResult, currentTimestamp)
    
    log.info("✅ PRICE: Updated {} = ${} (confidence: {}% from {})", [
      token.symbol, 
      priceResult.price.toString(),
      priceResult.confidence.times(BigDecimal.fromString("100")).toString(),
      priceResult.source
    ])
    
    return priceResult.price
  }
  
  log.error("❌ PRICE: No reliable price found for {} (tried all sources)", [token.symbol])

  // For critical stablecoins, try emergency fallback to prevent total failure
  let criticalStablecoins = [
    "0x0b2c639c533813f4aa9d7837caf62653d097ff85", // USDC
    "0x94b008aa00579c1307b0ef2c499ad98a8ce58e58",  // USDT
    "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",  // DAI
    "0xc40f949f8a4e094d1b49a23ea9241d289b7b2819"   // LUSD
  ]

  let tokenHex = token.id.toHexString().toLowerCase()
  for (let i = 0; i < criticalStablecoins.length; i++) {
    if (tokenHex == criticalStablecoins[i]) {
      log.warning("🚨 EMERGENCY: Using $1.00 fallback for critical stablecoin {}", [token.symbol])
      return BigDecimal.fromString("1.0") // Emergency fallback for critical stablecoins only
    }
  }

  return BigDecimal.fromString("0") // Fail gracefully for non-critical tokens
}

class PriceResult {
  price: BigDecimal
  confidence: BigDecimal
  source: string
  
  constructor(price: BigDecimal, confidence: BigDecimal, source: string) {
    this.price = price
    this.confidence = confidence
    this.source = source
  }
}

function initializeToken(address: Address): Token | null {
  let config = getTokenConfig(address)
  if (config == null) {
    return null
  }
  
  let token = new Token(address)
  token.symbol = config.symbol
  token.name = config.symbol
  token.decimals = BigInt.fromI32(config.decimals)
  token.derivedUSD = BigDecimal.fromString("0") // Start with 0, not $1
  token.priceConfidence = BigDecimal.fromString("0")
  token.priceSources = []
  token.lastPriceUpdate = BigInt.fromI32(0)
  
  // Initialize price sources
  for (let i = 0; i < config.priceSources.length; i++) {
    let sourceConfig = config.priceSources[i]
    let source = new PriceSource(sourceConfig.address)
    source.token = token.id
    source.sourceType = sourceConfig.sourceType
    source.priority = sourceConfig.priority
    source.isActive = true
    source.lastUpdate = BigInt.fromI32(0)
    source.lastPrice = BigDecimal.fromString("0")
    source.confidence = BigDecimal.fromString(sourceConfig.confidence.toString()).div(BigDecimal.fromString("100"))
    source.save()
    
    let sources = token.priceSources
    sources.push(source.id)
    token.priceSources = sources
  }
  
  token.save()
  return token
}

function getPriceFromSources(
  token: Token,
  timestamp: BigInt
): PriceResult {
  
  let config = getTokenConfig(Address.fromBytes(token.id))
  if (config == null) {
    return new PriceResult(BigDecimal.fromString("0"), BigDecimal.fromString("0"), "none")
  }
  
  // Try sources in priority order
  for (let i = 0; i < config.priceSources.length; i++) {
    let sourceConfig = config.priceSources[i]
    let result = getPriceFromSource(token, sourceConfig, timestamp)
    
    if (result.price.gt(BigDecimal.fromString("0"))) {
      log.info("✅ PRICE: Got {} price ${} from {} (confidence: {}%)", [
        token.symbol, 
        result.price.toString(), 
        sourceConfig.sourceType,
        result.confidence.times(BigDecimal.fromString("100")).toString()
      ])
      return result
    }
  }
  
  return new PriceResult(BigDecimal.fromString("0"), BigDecimal.fromString("0"), "failed")
}

function getPriceFromSource(
  token: Token,
  sourceConfig: PriceSourceConfig,
  timestamp: BigInt
): PriceResult {
  
  let sourceType = sourceConfig.sourceType
  let baseConfidence = BigDecimal.fromString(sourceConfig.confidence.toString()).div(BigDecimal.fromString("100"))
  
  if (sourceType == "chainlink") {
    let price = getChainlinkPrice(sourceConfig.address)
    if (price.gt(BigDecimal.fromString("0")) && validatePriceResult(price, token.symbol)) {
      return new PriceResult(price, baseConfidence, "chainlink")
    }
  }
  
  if (sourceType == "chainlink_reference") {
    // Used for tokens without direct feeds (USDC.e referencing USDC)
    let price = getChainlinkPrice(sourceConfig.address)
    if (price.gt(BigDecimal.fromString("0")) && validatePriceResult(price, token.symbol)) {
      // Slightly lower confidence for reference prices
      return new PriceResult(price, baseConfidence.times(BigDecimal.fromString("0.9")), "chainlink_ref")
    }
  }
  
  if (sourceType == "curve_3pool") {
    let price = getCurve3PoolPrice(Address.fromBytes(token.id))
    if (price.gt(BigDecimal.fromString("0")) && validatePriceResult(price, token.symbol)) {
      return new PriceResult(price, baseConfidence, "curve")
    }
  }
  
  if (sourceType == "uniswap_v3") {
    let price = getUniswapV3Price(
      Address.fromBytes(token.id),
      sourceConfig.address,
      sourceConfig.pairToken!,
      sourceConfig.fee
    )
    if (price.gt(BigDecimal.fromString("0")) && validatePriceResult(price, token.symbol)) {
      return new PriceResult(price, baseConfidence, "uniswap_v3")
    }
  }
  
  if (sourceType == "velodrome_v2" || sourceType == "velodrome_slipstream") {
    let price = getVelodromePrice(
      Address.fromBytes(token.id),
      sourceConfig.address,
      sourceConfig.pairToken!
    )
    if (price.gt(BigDecimal.fromString("0")) && validatePriceResult(price, token.symbol)) {
      return new PriceResult(price, baseConfidence, "velodrome")
    }
  }
  
  return new PriceResult(BigDecimal.fromString("0"), BigDecimal.fromString("0"), "unsupported")
}

function createPriceUpdate(
  token: Token,
  result: PriceResult,
  timestamp: BigInt
): void {
  let id = token.id.concat(Bytes.fromUTF8(timestamp.toString()))
  let update = new PriceUpdate(id)
  update.token = token.id
  update.priceUSD = result.price
  update.confidence = result.confidence
  update.source = token.priceSources[0] // Primary source used
  update.timestamp = timestamp
  update.block = BigInt.fromI32(0) // Would need block context
  update.save()
}

function validatePriceResult(price: BigDecimal, tokenSymbol: string): boolean {
  // Reasonable price bounds for most tokens
  let minPrice = BigDecimal.fromString("0.0001")  // $0.0001
  let maxPrice = BigDecimal.fromString("100000")   // $100,000
  
  if (price.le(minPrice)) {
    log.warning("⚠️ PRICE: Price too low for {}: ${}", [tokenSymbol, price.toString()])
    return false
  }
  
  if (price.ge(maxPrice)) {
    log.warning("⚠️ PRICE: Price too high for {}: ${}", [tokenSymbol, price.toString()])
    return false
  }
  
  return true
}

// Import price adapter functions (we'll create these next)
import {
  getChainlinkPrice,
  getCurve3PoolPrice,
  getUniswapV3Price,
  getVelodromePrice
} from "./priceAdapters"
