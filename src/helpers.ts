import { BigDecimal, BigInt, Address, Bytes, log } from "@graphprotocol/graph-ts"
import { FundingBalance } from "../generated/schema"

export function updateFunding(
  safe: Address,
  usd: BigDecimal,
  deposit: boolean,
  ts: BigInt
): void {
  log.info("updateFunding called: safe={}, usd={}, deposit={}, timestamp={}", [
    safe.toHexString(),
    usd.toString(),
    deposit.toString(),
    ts.toString()
  ])
  
  let id = safe as Bytes
  let fb = FundingBalance.load(id)
  let isNewEntity = false
  
  if (!fb) {
    log.info("Creating new FundingBalance entity for safe: {}", [safe.toHexString()])
    fb = new FundingBalance(id)
    fb.totalInUsd = BigDecimal.zero()
    fb.totalOutUsd = BigDecimal.zero()
    fb.netUsd = BigDecimal.zero()
    fb.firstInTimestamp = ts
    isNewEntity = true
  } else {
    log.info("Updating existing FundingBalance entity for safe: {}", [safe.toHexString()])
  }
  
  let oldTotalIn = fb.totalInUsd
  let oldTotalOut = fb.totalOutUsd
  
  if (deposit) {
    fb.totalInUsd = fb.totalInUsd.plus(usd)
    log.info("Deposit: totalInUsd updated from {} to {}", [oldTotalIn.toString(), fb.totalInUsd.toString()])
  } else {
    fb.totalOutUsd = fb.totalOutUsd.plus(usd)
    log.info("Withdrawal: totalOutUsd updated from {} to {}", [oldTotalOut.toString(), fb.totalOutUsd.toString()])
  }
  
  fb.netUsd = fb.totalInUsd.minus(fb.totalOutUsd)
  fb.lastChangeTs = ts
  
  log.info("Final values before save: totalInUsd={}, totalOutUsd={}, netUsd={}", [
    fb.totalInUsd.toString(),
    fb.totalOutUsd.toString(),
    fb.netUsd.toString()
  ])
  
  fb.save()
  log.info("FundingBalance entity saved successfully for safe: {}", [safe.toHexString()])
}
