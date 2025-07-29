import { BigInt, BigDecimal, log } from "@graphprotocol/graph-ts"
import {
  Safe,
  SafeReceived as SafeReceivedEvent,
  ExecutionSuccess as ExecutionSuccessEvent
} from "../generated/Safe/Safe"
import { isFundingSource, getEthUsd } from "./common"
import { getServiceByAgent } from "./config"
import { updateFunding } from "./helpers"

export function handleSafeReceived(event: SafeReceivedEvent): void {
  // Handle funding balance update for ETH received
  let from = event.params.sender
  let to = event.transaction.to // The safe that received ETH
  let value = event.params.value
  let txHash = event.transaction.hash.toHexString()
  
  // Debug log
  log.debug("FUNDING: ETH SafeReceived - from: {}, to: {}, value: {}, block: {}", [
    from.toHexString(),
    to ? to.toHexString() : "null",
    value.toString(),
    event.block.number.toString()
  ])
  
  // Check if the receiving safe is a service safe
  if (to !== null) {
    let toService = getServiceByAgent(to!)
    
    if (toService !== null) {
      // Check if sender is valid funding source for this service
      if (isFundingSource(from, to!, event.block, txHash)) {
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
        
        updateFunding(to!, usd, true, event.block.timestamp)
      }
    }
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
