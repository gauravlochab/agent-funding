import { Transfer } from "../generated/USDC_Native/ERC20"
import { Address, BigDecimal, log } from "@graphprotocol/graph-ts"
import {
  isFundingSource, FUNDING_TOKENS,
  getEthUsd, getUsdcUsd
} from "./common"
import { getServiceByAgent } from "./config"
import { updateFunding } from "./helpers"
import { handleERC20Transfer } from "./tokenBalances"

// Re-export handleERC20Transfer from tokenBalances
export { handleERC20Transfer } from "./tokenBalances"

// USDC Transfer - Dynamic multi-service version
export function handleUSDC(ev: Transfer): void {
  let from = ev.params.from
  let to = ev.params.to
  let value = ev.params.value
  let txHash = ev.transaction.hash.toHexString()
  
  // Debug log to verify handler is being called
  log.debug("FUNDING: USDC Transfer event - from: {}, to: {}, value: {}, block: {}", [
    from.toHexString(),
    to.toHexString(),
    value.toString(),
    ev.block.number.toString()
  ])
  
  // Check if service safe is involved
  let fromService = getServiceByAgent(from)
  let toService = getServiceByAgent(to)
  
  // Case 1: Transfer TO service safe
  if (toService != null) {
    // Check if sender is valid funding source for this service
    if (isFundingSource(from, to, ev.block, txHash)) {
      let usd = value.toBigDecimal()
        .times(getUsdcUsd(ev.block))
        .div(BigDecimal.fromString("1e6"))
      
      log.info("FUNDING: IN {} USDC to {} from {}", [
        usd.toString(),
        to.toHexString(),
        from.toHexString()
      ])
      
      updateFunding(to, usd, true, ev.block.timestamp)
    }
  }
  
  // Case 2: Transfer FROM service safe
  if (fromService != null) {
    // Check if receiver is valid funding source for this service
    if (isFundingSource(to, from, ev.block, txHash)) {
      let usd = value.toBigDecimal()
        .times(getUsdcUsd(ev.block))
        .div(BigDecimal.fromString("1e6"))
      
      log.info("FUNDING: OUT {} USDC from {} to {}", [
        usd.toString(),
        from.toHexString(),
        to.toHexString()
      ])
      
      updateFunding(from, usd, false, ev.block.timestamp)
    }
  }
  
  // Also update token balances for USDC
  handleERC20Transfer(ev)
}
