import { BigDecimal, Address, Bytes, log, ethereum, BigInt } from "@graphprotocol/graph-ts"
import { TokenBalance, Service, FundingBalance } from "../generated/schema"
import { Transfer as TransferEvent } from "../generated/USDC_Native/ERC20"
import { TOKENS } from "./tokenConfig"
import { getServiceByAgent } from "./config"
import { isFundingSource } from "./common"
import { getTokenPriceUSD } from "./priceDiscovery"

// Calculate the total USD value of uninvested funds (tokens held in the safe)
export function calculateUninvestedValue(serviceSafe: Address): BigDecimal {
  let totalUSD = BigDecimal.zero()
  
  // Check ETH balance
  let ethAddress = Address.zero()
  let ethBalanceId = serviceSafe.toHexString() + "-" + ethAddress.toHexString()
  let ethBalance = TokenBalance.load(Bytes.fromUTF8(ethBalanceId))
  
  if (ethBalance != null && ethBalance.balance.gt(BigDecimal.zero())) {
    totalUSD = totalUSD.plus(ethBalance.balanceUSD)
    log.info("calculateUninvestedValue: ETH balance {} USD for safe {}", [
      ethBalance.balanceUSD.toString(),
      serviceSafe.toHexString()
    ])
  }
  
  // Check whitelisted token balances from tokenConfig
  let tokenKeys = TOKENS.keys()
  for (let i = 0; i < tokenKeys.length; i++) {
    let tokenAddress = tokenKeys[i]
    let balanceId = serviceSafe.toHexString() + "-" + tokenAddress
    let balance = TokenBalance.load(Bytes.fromUTF8(balanceId))
    
    if (balance != null && balance.balance.gt(BigDecimal.zero())) {
      totalUSD = totalUSD.plus(balance.balanceUSD)
      log.info("calculateUninvestedValue: {} balance {} USD for safe {}", [
        balance.symbol,
        balance.balanceUSD.toString(),
        serviceSafe.toHexString()
      ])
    }
  }
  
  log.info("calculateUninvestedValue: Total uninvested value {} USD for safe {}", [
    totalUSD.toString(),
    serviceSafe.toHexString()
  ])
  
  return totalUSD
}

// Update ETH balance for a service safe
export function updateETHBalance(
  serviceSafe: Address,
  amount: BigInt,
  isIncrease: boolean,
  block: ethereum.Block
): void {
  let service = getServiceByAgent(serviceSafe)
  if (service == null) {
    log.warning("updateETHBalance: Service not found for safe {}", [serviceSafe.toHexString()])
    return
  }
  
  let ethAddress = Address.zero()
  let balanceId = serviceSafe.toHexString() + "-" + ethAddress.toHexString()
  let balance = TokenBalance.load(Bytes.fromUTF8(balanceId))
  
  if (balance == null) {
    balance = new TokenBalance(Bytes.fromUTF8(balanceId))
    balance.service = serviceSafe
    balance.token = ethAddress
    balance.symbol = "ETH"
    balance.decimals = 18
    balance.balance = BigDecimal.zero()
    balance.balanceUSD = BigDecimal.zero()
  }
  
  // Update balance
  let amountDecimal = amount.toBigDecimal().div(BigDecimal.fromString("1e18"))
  if (isIncrease) {
    balance.balance = balance.balance.plus(amountDecimal)
  } else {
    balance.balance = balance.balance.minus(amountDecimal)
    if (balance.balance.lt(BigDecimal.zero())) {
      balance.balance = BigDecimal.zero()
    }
  }
  
  // Update USD value using price discovery
  let ethPrice = getTokenPriceUSD(Address.fromString("0x4200000000000000000000000000000000000006"), block.timestamp, false) // WETH address
  balance.balanceUSD = balance.balance.times(ethPrice)
  
  balance.lastUpdated = block.timestamp
  balance.lastBlock = block.number
  balance.save()
  
  log.info("updateETHBalance: Updated ETH balance for safe {} to {} ETH ({} USD)", [
    serviceSafe.toHexString(),
    balance.balance.toString(),
    balance.balanceUSD.toString()
  ])
}

// Update token balance for a service safe
export function updateTokenBalance(
  serviceSafe: Address,
  tokenAddress: Address,
  amount: BigInt,
  isIncrease: boolean,
  block: ethereum.Block
): void {
  let service = getServiceByAgent(serviceSafe)
  if (service == null) {
    log.warning("updateTokenBalance: Service not found for safe {}", [serviceSafe.toHexString()])
    return
  }
  
  // Check if token is whitelisted
  let tokenConfig = TOKENS.get(tokenAddress.toHexString().toLowerCase())
  if (tokenConfig == null) {
    log.warning("updateTokenBalance: Token {} not whitelisted", [tokenAddress.toHexString()])
    return
  }
  
  let balanceId = serviceSafe.toHexString() + "-" + tokenAddress.toHexString()
  let balance = TokenBalance.load(Bytes.fromUTF8(balanceId))
  
  if (balance == null) {
    balance = new TokenBalance(Bytes.fromUTF8(balanceId))
    balance.service = serviceSafe
    balance.token = tokenAddress
    balance.symbol = tokenConfig.symbol
    balance.decimals = tokenConfig.decimals
    balance.balance = BigDecimal.zero()
    balance.balanceUSD = BigDecimal.zero()
  }
  
  // Update balance
  let divisor = BigInt.fromI32(10).pow(tokenConfig.decimals as u8)
  let amountDecimal = amount.toBigDecimal().div(divisor.toBigDecimal())
  
  if (isIncrease) {
    balance.balance = balance.balance.plus(amountDecimal)
  } else {
    balance.balance = balance.balance.minus(amountDecimal)
    if (balance.balance.lt(BigDecimal.zero())) {
      balance.balance = BigDecimal.zero()
    }
  }
  
  // Update USD value using price discovery
  let tokenPrice = getTokenPriceUSD(tokenAddress, block.timestamp, false)
  balance.balanceUSD = balance.balance.times(tokenPrice)
  
  balance.lastUpdated = block.timestamp
  balance.lastBlock = block.number
  balance.save()
  
  log.info("updateTokenBalance: Updated {} balance for safe {} to {} ({} USD)", [
    tokenConfig.symbol,
    serviceSafe.toHexString(),
    balance.balance.toString(),
    balance.balanceUSD.toString()
  ])
}

// Handle ERC20 transfer events
export function handleERC20Transfer(event: TransferEvent): void {
  let from = event.params.from
  let to = event.params.to
  let value = event.params.value
  let tokenAddress = event.address
  
  // Check if this is a whitelisted token
  let tokenConfig = TOKENS.get(tokenAddress.toHexString().toLowerCase())
  if (tokenConfig == null) {
    return // Not a whitelisted token
  }
  
  // Handle transfers TO service safes (deposits)
  let toService = getServiceByAgent(to)
  if (toService != null) {
    updateTokenBalance(to, tokenAddress, value, true, event.block)
    
    // Check if it's a funding deposit
    if (isFundingSource(from, to, event.block, event.transaction.hash.toHexString())) {
      // Calculate USD value using price discovery
      let divisor = BigInt.fromI32(10).pow(tokenConfig.decimals as u8)
      let amountDecimal = value.toBigDecimal().div(divisor.toBigDecimal())
      let tokenPrice = getTokenPriceUSD(tokenAddress, event.block.timestamp, false)
      let usdValue = amountDecimal.times(tokenPrice)
      
      log.info("FUNDING: IN {} USD ({}) to {} from {}", [
        usdValue.toString(),
        tokenConfig.symbol,
        to.toHexString(),
        from.toHexString()
      ])
      
      // Update funding balance directly to avoid circular dependency
      updateFundingBalance(to, usdValue, true, event.block.timestamp)
    }
  }
  
  // Handle transfers FROM service safes (withdrawals)
  let fromService = getServiceByAgent(from)
  if (fromService != null) {
    updateTokenBalance(from, tokenAddress, value, false, event.block)
    
    // Calculate USD value for funding tracking
    let divisor = BigInt.fromI32(10).pow(tokenConfig.decimals as u8)
    let amountDecimal = value.toBigDecimal().div(divisor.toBigDecimal())
    let tokenPrice = getTokenPriceUSD(tokenAddress, event.block.timestamp, false)
    let usdValue = amountDecimal.times(tokenPrice)
    
    log.info("FUNDING: OUT {} USD ({}) from {} to {}", [
      usdValue.toString(),
      tokenConfig.symbol,
      from.toHexString(),
      to.toHexString()
    ])
    
    // Update funding balance directly to avoid circular dependency
    updateFundingBalance(from, usdValue, false, event.block.timestamp)
  }
}

// Helper function to update funding balance without circular dependency
function updateFundingBalance(
  serviceSafe: Address,
  usd: BigDecimal,
  deposit: boolean,
  ts: BigInt
): void {
  let id = serviceSafe as Bytes
  let fb = FundingBalance.load(id)
  
  if (!fb) {
    fb = new FundingBalance(id)
    fb.service = serviceSafe
    fb.totalInUsd = BigDecimal.zero()
    fb.totalOutUsd = BigDecimal.zero()
    fb.netUsd = BigDecimal.zero()
    fb.firstInTimestamp = ts
  }
  
  if (deposit) {
    fb.totalInUsd = fb.totalInUsd.plus(usd)
  } else {
    fb.totalOutUsd = fb.totalOutUsd.plus(usd)
  }
  
  fb.netUsd = fb.totalInUsd.minus(fb.totalOutUsd)
  fb.lastChangeTs = ts
  fb.save()
}
