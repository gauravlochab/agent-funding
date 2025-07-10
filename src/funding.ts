import { SafeReceived, ExecutionSuccess } from "../generated/Safe/Safe"
import { Transfer } from "../generated/ERC20/ERC20"
import { Address, BigDecimal, log } from "@graphprotocol/graph-ts"
import {
  isFundingSource, FUNDING_TOKENS,
  getEthUsd, getUsdcUsd, isSafe
} from "./common"
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

// USDC Transfer
export function handleUSDC(ev: Transfer): void {
  let from = ev.params.from, to = ev.params.to
  let value = ev.params.value
  let txHash = ev.transaction.hash.toHexString()
  
  // Log every USDC transfer for debugging
  log.info("USDC Transfer detected: contract={}, from={}, to={}, value={}, txHash={}", [
    ev.address.toHexString(),
    from.toHexString(),
    to.toHexString(), 
    value.toString(),
    txHash
  ])
  
  // Check if from is funding source
  let fromIsFundingSource = isFundingSource(from, ev.block, txHash)
  log.info("From address {} is funding source: {}, txHash={}", [from.toHexString(), fromIsFundingSource.toString(), txHash])
  
  // Check if to is Safe
  let toIsSafe = isSafe(to, txHash)
  log.info("To address {} is Safe: {}, txHash={}", [to.toHexString(), toIsSafe.toString(), txHash])
  
  // Check if from is Safe
  let fromIsSafe = isSafe(from, txHash)
  log.info("From address {} is Safe: {}, txHash={}", [from.toHexString(), fromIsSafe.toString(), txHash])
  
  // Check if to is funding source
  let toIsFundingSource = isFundingSource(to, ev.block, txHash)
  log.info("To address {} is funding source: {}, txHash={}", [to.toHexString(), toIsFundingSource.toString(), txHash])
  
  // USDC in to Safe
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
  // USDC out from Safe
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
