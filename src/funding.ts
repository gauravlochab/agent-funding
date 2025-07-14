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
  // Quick Safe address check first
  let safeAddr = SAFE_ADDRESS_HEX
  let fromHex = ev.params.from.toHexString().toLowerCase()
  let toHex = ev.params.to.toHexString().toLowerCase()
  
  // Early exit if neither address is our Safe
  if (fromHex != safeAddr && toHex != safeAddr) {
    return
  }
  
  let from = ev.params.from
  let to = ev.params.to
  let value = ev.params.value
  let txHash = ev.transaction.hash.toHexString()
  
  // Determine which address is the Safe
  let fromIsSafe = (fromHex == safeAddr)
  let toIsSafe = (toHex == safeAddr)
  
  // Check funding source status only when needed
  let fromIsFundingSource = false
  let toIsFundingSource = false
  
  if (!fromIsSafe) {
    fromIsFundingSource = isFundingSource(from, ev.block, txHash)
  }
  
  if (!toIsSafe) {
    toIsFundingSource = isFundingSource(to, ev.block, txHash)
  }
  
  // USDC in to Safe (from funding source to Safe)
  if (fromIsFundingSource && toIsSafe) {
    let usd = value.toBigDecimal()
      .times(getUsdcUsd(ev.block))
      .div(BigDecimal.fromString("1e6"))
    updateFunding(to, usd, true, ev.block.timestamp)
  } 
  // USDC out from Safe (from Safe to funding source)
  else if (fromIsSafe && toIsFundingSource) {
    let usd = value.toBigDecimal()
      .times(getUsdcUsd(ev.block))
      .div(BigDecimal.fromString("1e6"))
    updateFunding(from, usd, false, ev.block.timestamp)
  }
}
