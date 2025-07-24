import { BigDecimal, BigInt, Address, Bytes, log } from "@graphprotocol/graph-ts"
import { FundingBalance } from "../generated/schema"

export function updateFunding(
  serviceSafe: Address,
  usd: BigDecimal,
  deposit: boolean,
  ts: BigInt
): void {
  let id = serviceSafe as Bytes
  let fb = FundingBalance.load(id)
  
  if (!fb) {
    fb = new FundingBalance(id)
    fb.service = serviceSafe // Link to Service entity
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
