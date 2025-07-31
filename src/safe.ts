import { BigInt, BigDecimal, log } from "@graphprotocol/graph-ts"
import {
  Safe,
  SafeReceived as SafeReceivedEvent,
  ExecutionSuccess as ExecutionSuccessEvent
} from "../generated/Safe/Safe"
import { isFundingSource, getEthUsd } from "./common"
import { getServiceByAgent } from "./config"
import { updateFunding } from "./helpers"
import { updateETHBalance } from "./tokenBalances"

export function handleSafeReceived(event: SafeReceivedEvent): void {
  // Handle funding balance update for ETH received
  let from = event.params.sender
  let to = event.address // The safe that received ETH (emitted the event)
  let value = event.params.value
  let txHash = event.transaction.hash.toHexString()
  
  // Debug log
  log.debug("FUNDING: ETH SafeReceived - from: {}, to: {}, value: {}, block: {}", [
    from.toHexString(),
    to.toHexString(),
    value.toString(),
    event.block.number.toString()
  ])
  
  // Check if the receiving safe is a service safe
  let toService = getServiceByAgent(to)
  
  if (toService !== null) {
    // Check if sender is valid funding source for this service
    if (isFundingSource(from, to, event.block, txHash)) {
      // Convert ETH to USD
      let ethPrice = getEthUsd(event.block)
      let usd = value.toBigDecimal()
        .times(ethPrice)
        .div(BigDecimal.fromString("1e18")) // ETH has 18 decimals
      
      log.info("FUNDING: IN {} USD (ETH) to {} from {}", [
        usd.toString(),
        to.toHexString(),
        from.toHexString()
      ])
      
      updateFunding(to, usd, true, event.block.timestamp)
      
      // Also update ETH balance in TokenBalance
      updateETHBalance(to, value, true, event.block)
    } else {
      log.info("FUNDING: ETH received but sender {} is not a valid funding source for safe {}", [
        from.toHexString(),
        to.toHexString()
      ])
    }
  } else {
    log.warning("FUNDING: ETH SafeReceived for non-service safe: {}", [
      to.toHexString()
    ])
  }
}

export function handleExecutionSuccess(event: ExecutionSuccessEvent): void {
  // ExecutionSuccess could be used to track ETH outflows
  // For now, we'll just log it
  log.debug("Safe ExecutionSuccess: txHash: {}, payment: {}", [
    event.params.txHash.toHexString(),
    event.params.payment.toString()
  ])
  
  // TODO: In the future, we could analyze the executed transaction
  // to see if it's an ETH transfer out and update funding accordingly
}
