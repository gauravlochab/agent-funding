import { BigDecimal, BigInt, Address, Bytes, log } from "@graphprotocol/graph-ts"
import { FundingBalance } from "../generated/schema"

export function updateFunding(
  safe: Address,
  usd: BigDecimal,
  deposit: boolean,
  ts: BigInt
): void {
  let id = safe as Bytes
  let fb = FundingBalance.load(id)
  
  if (!fb) {
    fb = new FundingBalance(id)
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
