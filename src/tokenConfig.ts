import { Address, BigInt } from "@graphprotocol/graph-ts"

// Token configurations with Chainlink-first approach
export const TOKENS = new Map<string, TokenConfig>()

export class TokenConfig {
  address: Address
  symbol: string
  decimals: i32
  priceSources: PriceSourceConfig[]
  
  constructor(
    address: Address,
    symbol: string,
    decimals: i32,
    priceSources: PriceSourceConfig[]
  ) {
    this.address = address
    this.symbol = symbol
    this.decimals = decimals
    this.priceSources = priceSources
  }
}

export class PriceSourceConfig {
  address: Address
  sourceType: string
  priority: i32
  pairToken: Address | null
  fee: i32
  confidence: i32  // Expected confidence level (0-100)
  
  constructor(
    address: Address,
    sourceType: string,
    priority: i32,
    confidence: i32 = 95,
    pairToken: Address | null = null,
    fee: i32 = 0
  ) {
    this.address = address
    this.sourceType = sourceType
    this.priority = priority
    this.confidence = confidence
    this.pairToken = pairToken
    this.fee = fee
  }
}

// Chainlink feed addresses on Optimism mainnet
const CHAINLINK_FEEDS = new Map<string, string>()
CHAINLINK_FEEDS.set("ETH_USD", "0x13e3Ee699D1909E989722E753853AE30b17e08c5")
CHAINLINK_FEEDS.set("USDC_USD", "0x16a9FA2FDa030272Ce99B29CF780dFA30361E0f3")
CHAINLINK_FEEDS.set("USDT_USD", "0xECef79E109e997bCA29c1c0897ec9d7b03647F5E")
CHAINLINK_FEEDS.set("DAI_USD", "0x8dBa75e83DA73cc766A7e5a0ee71F656BAb470d6")

export function getTokenConfig(address: Address): TokenConfig | null {
  let key = address.toHexString().toLowerCase()
  if (TOKENS.has(key)) {
    return TOKENS.get(key)
  }
  return null
}

export function getChainlinkFeed(feedName: string): string | null {
  return CHAINLINK_FEEDS.get(feedName)
}

function getChainlinkFeedSafe(feedName: string): string {
  let feed = CHAINLINK_FEEDS.get(feedName)
  if (feed === null) {
    // This should never happen if feeds are properly configured
    throw new Error("Chainlink feed not found: " + feedName)
  }
  return feed
}

// Initialize token configurations
function initializeTokens(): void {
  
  // USDC - Chainlink first, then high-liquidity pools
  TOKENS.set("0x0b2c639c533813f4aa9d7837caf62653d097ff85", new TokenConfig(
    Address.fromString("0x0b2c639c533813f4aa9d7837caf62653d097ff85"),
    "USDC",
    6,
    [
      // Priority 1: Chainlink USDC/USD (highest confidence)
      new PriceSourceConfig(
        Address.fromString(getChainlinkFeedSafe("USDC_USD")),
        "chainlink",
        1,
        99
      ),
      // Priority 2: Curve 3Pool (validation)
      new PriceSourceConfig(
        Address.fromString("0x1337bedc9d22ecbe766df105c9623922a27963ec"),
        "curve_3pool",
        2,
        95
      ),
      // Priority 3: Uniswap V3 USDC/USDT (high volume backup)
      // TODO: VERIFY - Pool address needs verification on Optimism
      new PriceSourceConfig(
        Address.fromString("0xa73c628eaf6e283e26a7b1f8001cf186aa4c0e8e"), // VERIFY: USDC/USDT 0.01% pool
        "uniswap_v3",
        3,
        90,
        Address.fromString("0x94b008aa00579c1307b0ef2c499ad98a8ce58e58"), // USDT
        1 // 0.01% fee
      )
    ]
  ))

  // WETH - Chainlink first
  TOKENS.set("0x4200000000000000000000000000000000000006", new TokenConfig(
    Address.fromString("0x4200000000000000000000000000000000000006"),
    "WETH",
    18,
    [
      // Priority 1: Chainlink ETH/USD
      new PriceSourceConfig(
        Address.fromString(getChainlinkFeedSafe("ETH_USD")),
        "chainlink",
        1,
        99
      ),
      // Priority 2: Uniswap V3 WETH/USDC (high volume)
      // TODO: VERIFY - Pool address needs verification on Optimism
      new PriceSourceConfig(
        Address.fromString("0x85149247691df622eaf1a8bd0cafd40bc45154a9"), // VERIFY: WETH/USDC.e pool
        "uniswap_v3",
        2,
        90,
        Address.fromString("0x0b2c639c533813f4aa9d7837caf62653d097ff85"), // USDC
        5 // 0.05% fee
      )
    ]
  ))

  // DAI - Chainlink first, then Curve
  TOKENS.set("0xda10009cbd5d07dd0cecc66161fc93d7c9000da1", new TokenConfig(
    Address.fromString("0xda10009cbd5d07dd0cecc66161fc93d7c9000da1"),
    "DAI",
    18,
    [
      // Priority 1: Chainlink DAI/USD
      new PriceSourceConfig(
        Address.fromString(getChainlinkFeedSafe("DAI_USD")),
        "chainlink",
        1,
        99
      ),
      // Priority 2: Curve 3Pool
      new PriceSourceConfig(
        Address.fromString("0x1337bedc9d22ecbe766df105c9623922a27963ec"),
        "curve_3pool",
        2,
        95
      )
    ]
  ))

  // USDT - Chainlink first
  TOKENS.set("0x94b008aa00579c1307b0ef2c499ad98a8ce58e58", new TokenConfig(
    Address.fromString("0x94b008aa00579c1307b0ef2c499ad98a8ce58e58"),
    "USDT",
    6,
    [
      // Priority 1: Chainlink USDT/USD
      new PriceSourceConfig(
        Address.fromString(getChainlinkFeedSafe("USDT_USD")),
        "chainlink",
        1,
        99
      ),
      // Priority 2: Curve 3Pool
      new PriceSourceConfig(
        Address.fromString("0x1337bedc9d22ecbe766df105c9623922a27963ec"),
        "curve_3pool",
        2,
        95
      )
    ]
  ))

  // USDC.e - No Chainlink, use pools only
  TOKENS.set("0x7f5c764cbc14f9669b88837ca1490cca17c31607", new TokenConfig(
    Address.fromString("0x7f5c764cbc14f9669b88837ca1490cca17c31607"),
    "USDC.e",
    6,
    [
      // Priority 1: Uniswap V3 USDC.e/USDT (high volume)
      // TODO: VERIFY - Pool address needs verification on Optimism
      new PriceSourceConfig(
        Address.fromString("0xf1f199342687a7d78bcc16fce79fa2665ef870e1"), // VERIFY: USDC.e/USDT 0.01% pool
        "uniswap_v3",
        1,
        85,
        Address.fromString("0x94b008aa00579c1307b0ef2c499ad98a8ce58e58"), // USDT
        1 // 0.01% fee
      ),
      // Priority 2: Reference USDC Chainlink (should be ~1:1)
      new PriceSourceConfig(
        Address.fromString(getChainlinkFeedSafe("USDC_USD")),
        "chainlink_reference",
        2,
        80
      )
    ]
  ))

  // DOLA - Pool-based only
  TOKENS.set("0x8ae125e8653821e851f12a49f7765db9a9ce7384", new TokenConfig(
    Address.fromString("0x8ae125e8653821e851f12a49f7765db9a9ce7384"),
    "DOLA",
    18,
    [
      // Only use DOLA/USDC pool - no MAI pair available
      new PriceSourceConfig(
        Address.fromString("0x6c5019d345ec05004a7e7b0623a91a0d9b8d590d"),
        "velodrome_v2",
        1,
        80,
        Address.fromString("0x0b2c639c533813f4aa9d7837caf62653d097ff85") // USDC
      )
    ]
  ))

  // BOLD - Velodrome V2 concentrated
  TOKENS.set("0x087c440f251ff6cfe62b86dde1be558b95b4bb9b", new TokenConfig(
    Address.fromString("0x087c440f251ff6cfe62b86dde1be558b95b4bb9b"),
    "BOLD",
    18,
    [
      // Priority 1: Velodrome BOLD/USDC (highest TVL)
      new PriceSourceConfig(
        Address.fromString("0xf5ce76b51a4d7f0242bb02b830a73abfa9792157"),
        "velodrome_v2",
        1,
        85,
        Address.fromString("0x0b2c639c533813f4aa9d7837caf62653d097ff85") // USDC
      ),
      // Priority 2: Velodrome BOLD/LUSD
      new PriceSourceConfig(
        Address.fromString("0xfe09d5156c4d4ac3b57b192608a8423401bac186"),
        "velodrome_v2",
        2,
        80,
        Address.fromString("0xc40f949f8a4e094d1b49a23ea9241d289b7b2819") // LUSD
      )
    ]
  ))

  // LUSD - Use Velodrome V2 instead of empty Uniswap pool
  TOKENS.set("0xc40f949f8a4e094d1b49a23ea9241d289b7b2819", new TokenConfig(
    Address.fromString("0xc40f949f8a4e094d1b49a23ea9241d289b7b2819"),
    "LUSD",
    18,
    [
      // Priority 1: Velodrome V2 USDC/LUSD (active pool)
      new PriceSourceConfig(
        Address.fromString("0x4f3da11c5cadf644ae023dbad01008a934c993e2"),
        "velodrome_v2",
        1,
        85,
        Address.fromString("0x0b2c639c533813f4aa9d7837caf62653d097ff85") // USDC
      )
    ]
  ))

  // FRAX - Multi-protocol
  TOKENS.set("0x2e3d870790dc77a83dd1d18184acc7439a53f475", new TokenConfig(
    Address.fromString("0x2e3d870790dc77a83dd1d18184acc7439a53f475"),
    "FRAX",
    18,
    [
      // Priority 1: Uniswap V3 FRAX/USDC
      new PriceSourceConfig(
        Address.fromString("0x98d9ae198f2018503791d1caf23c6807c135bb6b"),
        "uniswap_v3",
        1,
        80,
        Address.fromString("0x0b2c639c533813f4aa9d7837caf62653d097ff85"), // USDC
        5 // 0.05% fee
      )
    ]
  ))

  // sDAI - Velodrome SlipStream only
  TOKENS.set("0x2218a117083f5b482b0bb821d27056ba9c04b1d3", new TokenConfig(
    Address.fromString("0x2218a117083f5b482b0bb821d27056ba9c04b1d3"),
    "sDAI",
    18,
    [
      // Only use Velodrome SlipStream USDC/sDAI pool
      new PriceSourceConfig(
        Address.fromString("0x131525f3fa23d65dc2b1eb8b6483a28c43b06916"),
        "velodrome_slipstream",
        1,
        80,
        Address.fromString("0x0b2c639c533813f4aa9d7837caf62653d097ff85") // USDC
      )
    ]
  ))

  // Note: oUSDT, USDGLO, and USDT0 removed due to lack of reliable price sources
  // These tokens had non-existent chainlink_reference feeds and no alternative pools
  // They can be re-added when proper price sources are identified
}

// Call initialization
initializeTokens()
