import { SafeReceived, ExecutionSuccess } from "../generated/Safe/Safe"
import { Transfer } from "../generated/ERC20/ERC20"
import { Address, BigDecimal, log } from "@graphprotocol/graph-ts"
import {
  isFundingSource, FUNDING_TOKENS,
  getEthUsd, getUsdcUsd, isSafe
} from "./common"
import { SAFE_ADDRESS_HEX } from "./config"
import { updateFunding } from "./helpers"

// ETH in
export function handleSafeReceived(ev: SafeReceived): void {
  let txHash = ev.transaction.hash.toHexString()
  if (!isFundingSource(ev.params.sender, ev.block, txHash)) return
  let usd = ev.params.value.toBigDecimal()
    .times(getEthUsd(ev.block))
    .div(BigDecimal.fromString("1e18"))
  updateFunding(ev.address, usd, true, ev.block.timestamp)
}

// ETH out
export function handleExecutionSuccess(ev: ExecutionSuccess): void {
  let txHash = ev.transaction.hash.toHexString()
  if (ev.params.payment.isZero()) return
  let to = ev.transaction.to as Address
  if (!isFundingSource(to, ev.block, txHash)) return
  let usd = ev.params.payment.toBigDecimal()
    .times(getEthUsd(ev.block))
    .div(BigDecimal.fromString("1e18"))
  updateFunding(to, usd, false, ev.block.timestamp)
}

// USDC Transfer - OPTIMIZED VERSION
export function handleUSDC(ev: Transfer): void {
  // 🚀 CRITICAL OPTIMIZATION: Quick Safe address check first
  // This eliminates 99%+ of transfers immediately with minimal computation
  let safeAddr = SAFE_ADDRESS_HEX
  let fromHex = ev.params.from.toHexString().toLowerCase()
  let toHex = ev.params.to.toHexString().toLowerCase()
  
  // Early exit if neither address is our Safe
  if (fromHex != safeAddr && toHex != safeAddr) {
    return // Skip processing - saves massive amount of computation
  }
  
  // Only process transfers involving our Safe address
  let from = ev.params.from
  let to = ev.params.to
  let value = ev.params.value
  let txHash = ev.transaction.hash.toHexString()
  
  // Log only relevant USDC transfers now
  log.info("USDC Transfer involving Safe: contract={}, from={}, to={}, value={}, txHash={}", [
    ev.address.toHexString(),
    from.toHexString(),
    to.toHexString(), 
    value.toString(),
    txHash
  ])
  
  // Determine which address is the Safe (we know at least one is)
  let fromIsSafe = (fromHex == safeAddr)
  let toIsSafe = (toHex == safeAddr)
  
  // Now do the more expensive funding source checks only when needed
  let fromIsFundingSource = false
  let toIsFundingSource = false
  
  if (!fromIsSafe) {
    fromIsFundingSource = isFundingSource(from, ev.block, txHash)
    log.info("From address {} is funding source: {}, txHash={}", [from.toHexString(), fromIsFundingSource.toString(), txHash])
  }
  
  if (!toIsSafe) {
    toIsFundingSource = isFundingSource(to, ev.block, txHash)
    log.info("To address {} is funding source: {}, txHash={}", [to.toHexString(), toIsFundingSource.toString(), txHash])
  }
  
  // Log our determinations
  log.info("Address classifications: fromIsSafe={}, toIsSafe={}, fromIsFundingSource={}, toIsFundingSource={}, txHash={}", [
    fromIsSafe.toString(),
    toIsSafe.toString(),
    fromIsFundingSource.toString(),
    toIsFundingSource.toString(),
    txHash
  ])
  
  // USDC in to Safe (from funding source to Safe)
  if (fromIsFundingSource && toIsSafe) {
    log.info("Processing USDC IN: from funding source {} to Safe {}, amount: {}, txHash={}", [
      from.toHexString(),
      to.toHexString(),
      value.toString(),
      txHash
    ])
    let usd = value.toBigDecimal()
      .times(getUsdcUsd(ev.block))
      .div(BigDecimal.fromString("1e6"))
    log.info("USD value calculated: {}, txHash={}", [usd.toString(), txHash])
    updateFunding(to, usd, true, ev.block.timestamp)
  } 
  // USDC out from Safe (from Safe to funding source)
  else if (fromIsSafe && toIsFundingSource) {
    log.info("Processing USDC OUT: from Safe {} to funding source {}, amount: {}, txHash={}", [
      from.toHexString(),
      to.toHexString(),
      value.toString(),
      txHash
    ])
    let usd = value.toBigDecimal()
      .times(getUsdcUsd(ev.block))
      .div(BigDecimal.fromString("1e6"))
    log.info("USD value calculated: {}, txHash={}", [usd.toString(), txHash])
    updateFunding(from, usd, false, ev.block.timestamp)
  }
  else {
    log.info("USDC transfer ignored - conditions not met: fromIsFundingSource={}, toIsSafe={}, fromIsSafe={}, toIsFundingSource={}, txHash={}", [
      fromIsFundingSource.toString(),
      toIsSafe.toString(),
      fromIsSafe.toString(),
      toIsFundingSource.toString(),
      txHash
    ])
  }
}
