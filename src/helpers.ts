import { BigDecimal, BigInt, Address, Bytes, log, ethereum } from "@graphprotocol/graph-ts"
import { 
  FundingBalance, 
  AgentPortfolio, 
  AgentPortfolioSnapshot,
  ProtocolPosition,
  Service,
  OlasRewards
} from "../generated/schema"
import { calculateUninvestedValue } from "./tokenBalances"
import { getServiceByAgent } from "./config"

export function updateFunding(
  serviceSafe: Address,
  usd: BigDecimal,
  deposit: boolean,
  ts: BigInt
): void {
  log.info("FUNDING: Updating funding for service {} - Amount: {} USD, Deposit: {}", [
    serviceSafe.toHexString(),
    usd.toString(),
    deposit.toString()
  ])
  
  let id = serviceSafe as Bytes
  let fb = FundingBalance.load(id)
  
  if (!fb) {
    fb = new FundingBalance(id)
    fb.service = serviceSafe // Link to Service entity
    fb.totalInUsd = BigDecimal.zero()
    fb.totalOutUsd = BigDecimal.zero()
    fb.netUsd = BigDecimal.zero()
    fb.firstInTimestamp = ts
    log.info("FUNDING: Created new FundingBalance for service {}", [serviceSafe.toHexString()])
  }
  
  if (deposit) {
    fb.totalInUsd = fb.totalInUsd.plus(usd)
    log.info("FUNDING: Deposit - New totalIn: {} USD", [fb.totalInUsd.toString()])
  } else {
    fb.totalOutUsd = fb.totalOutUsd.plus(usd)
    log.info("FUNDING: Withdrawal - New totalOut: {} USD", [fb.totalOutUsd.toString()])
  }
  
  fb.netUsd = fb.totalInUsd.minus(fb.totalOutUsd)
  fb.lastChangeTs = ts
  
  log.info("FUNDING: Updated balance - TotalIn: {}, TotalOut: {}, Net: {} USD", [
    fb.totalInUsd.toString(),
    fb.totalOutUsd.toString(),
    fb.netUsd.toString()
  ])
  
  fb.save()
  
  // Update portfolio after funding change
  let block = new ethereum.Block(
    Bytes.empty(),
    Bytes.empty(),
    Bytes.empty(),
    Address.zero(),
    Bytes.empty(),
    Bytes.empty(),
    Bytes.empty(),
    BigInt.zero(),
    BigInt.zero(),
    BigInt.zero(),
    ts,
    BigInt.zero(),
    BigInt.zero(),
    BigInt.zero(),
    BigInt.zero()
  )
  calculatePortfolioMetrics(serviceSafe, block)
}

// Calculate portfolio metrics for an agent
export function calculatePortfolioMetrics(
  serviceSafe: Address, 
  block: ethereum.Block
): void {
  log.info("PORTFOLIO: ========== STARTING PORTFOLIO CALCULATION ==========", [])
  log.info("PORTFOLIO: Service: {}, Block: {}, Timestamp: {}", [
    serviceSafe.toHexString(),
    block.number.toString(),
    block.timestamp.toString()
  ])
  
  // Check if this is a valid service
  let service = getServiceByAgent(serviceSafe)
  if (service == null) {
    log.warning("PORTFOLIO: Service not found for address: {}", [serviceSafe.toHexString()])
    return
  }
  
  log.info("PORTFOLIO: Valid service found - ServiceId: {}", [service.serviceId.toString()])
  
  // Load or create AgentPortfolio
  let portfolioId = serviceSafe as Bytes
  let portfolio = AgentPortfolio.load(portfolioId)
  
  if (portfolio == null) {
    portfolio = new AgentPortfolio(portfolioId)
    portfolio.service = serviceSafe
    portfolio.firstTradingTimestamp = BigInt.zero() // Will be set on first position
    portfolio.totalPositions = 0
    portfolio.totalClosedPositions = 0
  }
  
  // 1. Get initial investment from FundingBalance
  let fundingBalance = FundingBalance.load(serviceSafe as Bytes)
  let initialValue = fundingBalance ? fundingBalance.netUsd : BigDecimal.zero()
  log.info("PORTFOLIO: Initial investment value: {} USD", [initialValue.toString()])
  
  // 2. Calculate total positions value
  let positionsValue = calculatePositionsValue(serviceSafe)
  log.info("PORTFOLIO: Total positions value: {} USD", [positionsValue.toString()])
  
  // 3. Calculate uninvested funds
  let uninvestedValue = calculateUninvestedValue(serviceSafe)
  log.info("PORTFOLIO: Uninvested funds value: {} USD", [uninvestedValue.toString()])
  
  // 4. NEW: Calculate OLAS rewards value
  let olasRewardsValue = BigDecimal.zero()
  let olasRewards = OlasRewards.load(serviceSafe as Bytes)
  if (olasRewards !== null) {
    olasRewardsValue = olasRewards.olasRewardsEarnedUSD
    log.info("PORTFOLIO: OLAS rewards - {} OLAS = {} USD", [
      olasRewards.olasRewardsEarned.toString(),
      olasRewardsValue.toString()
    ])
  }
  
  // 5. Calculate total portfolio value INCLUDING OLAS rewards
  let finalValue = positionsValue.plus(uninvestedValue).plus(olasRewardsValue)
  log.info("PORTFOLIO: Final portfolio value: {} USD (positions: {} + uninvested: {} + OLAS: {})", [
    finalValue.toString(),
    positionsValue.toString(),
    uninvestedValue.toString(),
    olasRewardsValue.toString()
  ])
  
  // 5. Calculate ROI and APR
  let roi = BigDecimal.zero()
  let apr = BigDecimal.zero()
  
  if (initialValue.gt(BigDecimal.zero())) {
    // ROI = (final_value - initial_value) / initial_value * 100
    let profit = finalValue.minus(initialValue)
    roi = profit.div(initialValue).times(BigDecimal.fromString("100"))
    
    log.info("PORTFOLIO: ROI Calculation - Profit: {} USD, ROI: {}%", [
      profit.toString(),
      roi.toString()
    ])
    
    // APR calculation - only if we have a first trading timestamp
    if (portfolio.firstTradingTimestamp.gt(BigInt.zero())) {
      let secondsSinceStart = block.timestamp.minus(portfolio.firstTradingTimestamp)
      let daysSinceStart = secondsSinceStart.toBigDecimal().div(BigDecimal.fromString("86400"))
      
      log.info("PORTFOLIO: APR Calculation - First trade: {}, Days since: {}", [
        portfolio.firstTradingTimestamp.toString(),
        daysSinceStart.toString()
      ])
      
      if (daysSinceStart.gt(BigDecimal.zero())) {
        // APR = roi * (365 / days_invested)
        let annualizationFactor = BigDecimal.fromString("365").div(daysSinceStart)
        apr = roi.times(annualizationFactor)
        
        log.info("PORTFOLIO: APR = ROI ({}) × Annualization Factor ({}) = {}%", [
          roi.toString(),
          annualizationFactor.toString(),
          apr.toString()
        ])
      }
    } else {
      log.info("PORTFOLIO: APR not calculated - no first trading timestamp", [])
    }
  } else {
    log.info("PORTFOLIO: ROI/APR not calculated - no initial investment", [])
  }
  
  // Update portfolio
  portfolio.finalValue = finalValue
  portfolio.initialValue = initialValue  
  portfolio.positionsValue = positionsValue
  portfolio.uninvestedValue = uninvestedValue
  portfolio.olasRewardsValue = olasRewardsValue  // ADD THIS LINE
  portfolio.roi = roi
  portfolio.apr = apr
  portfolio.lastUpdated = block.timestamp
  
  // Count positions
  let positionCounts = countPositions(serviceSafe)
  portfolio.totalPositions = positionCounts.active
  portfolio.totalClosedPositions = positionCounts.closed
  
  log.info("PORTFOLIO: Position counts - Active: {}, Closed: {}", [
    positionCounts.active.toString(),
    positionCounts.closed.toString()
  ])
  
  portfolio.save()
  
  // Create snapshot
  createPortfolioSnapshot(portfolio, block)
  
  log.info("PORTFOLIO: ========== PORTFOLIO CALCULATION COMPLETE ==========", [])
  log.info("PORTFOLIO: Summary - Final: {} USD, Initial: {} USD, ROI: {}%, APR: {}%", [
    finalValue.toString(),
    initialValue.toString(), 
    roi.toString(),
    apr.toString()
  ])
}

// Calculate total value of all active positions
function calculatePositionsValue(serviceSafe: Address): BigDecimal {
  let totalValue = BigDecimal.zero()
  
  // Get the service entity
  let service = Service.load(serviceSafe)
  if (service == null || service.positionIds == null) {
    log.info("PORTFOLIO: No positions found for service {}", [serviceSafe.toHexString()])
    return totalValue
  }
  
  // Iterate through all position IDs
  let positionIds = service.positionIds
  log.info("PORTFOLIO: Calculating value for {} positions", [positionIds.length.toString()])
  
  for (let i = 0; i < positionIds.length; i++) {
    // Position IDs are stored as strings, convert to Bytes
    let positionId = Bytes.fromUTF8(positionIds[i])
    let position = ProtocolPosition.load(positionId)
    
    if (position != null && position.isActive) {
      totalValue = totalValue.plus(position.usdCurrent)
      log.info("PORTFOLIO: Position {} - Protocol: {}, Value: {} USD, Active: {}", [
        positionIds[i],
        position.protocol,
        position.usdCurrent.toString(),
        position.isActive.toString()
      ])
    } else if (position != null) {
      log.info("PORTFOLIO: Position {} - Protocol: {}, INACTIVE", [
        positionIds[i],
        position.protocol
      ])
    } else {
      log.warning("PORTFOLIO: Position {} not found!", [positionIds[i]])
    }
  }
  
  return totalValue
}

// Count active and closed positions
function countPositions(serviceSafe: Address): PositionCounts {
  let activeCount = 0
  let closedCount = 0
  
  // Get the service entity
  let service = Service.load(serviceSafe)
  if (service == null || service.positionIds == null) {
    return {
      active: activeCount,
      closed: closedCount
    }
  }
  
  // Iterate through all position IDs
  let positionIds = service.positionIds
  for (let i = 0; i < positionIds.length; i++) {
    // Position IDs are stored as strings, convert to Bytes
    let positionId = Bytes.fromUTF8(positionIds[i])
    let position = ProtocolPosition.load(positionId)
    
    if (position != null) {
      if (position.isActive) {
        activeCount++
      } else {
        closedCount++
      }
    }
  }
  
  return {
    active: activeCount,
    closed: closedCount
  }
}

// Helper class for position counts
class PositionCounts {
  active: i32
  closed: i32
}

// Create a portfolio snapshot
function createPortfolioSnapshot(portfolio: AgentPortfolio, block: ethereum.Block): void {
  let snapshotId = portfolio.id.toHexString() + "-" + block.timestamp.toString()
  let snapshot = new AgentPortfolioSnapshot(Bytes.fromUTF8(snapshotId))
  
  snapshot.service = portfolio.service
  snapshot.portfolio = portfolio.id
  
  // Copy values
  snapshot.finalValue = portfolio.finalValue
  snapshot.initialValue = portfolio.initialValue
  snapshot.positionsValue = portfolio.positionsValue
  snapshot.uninvestedValue = portfolio.uninvestedValue
  
  // Copy performance metrics
  snapshot.roi = portfolio.roi
  snapshot.apr = portfolio.apr
  
  // Metadata
  snapshot.timestamp = block.timestamp
  snapshot.block = block.number
  snapshot.totalPositions = portfolio.totalPositions
  snapshot.totalClosedPositions = portfolio.totalClosedPositions
  
  snapshot.save()
  
  log.info("PORTFOLIO: Created snapshot {} at block {} with value {} USD", [
    snapshotId,
    block.number.toString(),
    portfolio.finalValue.toString()
  ])
}

// Update first trading timestamp when a position is created
export function updateFirstTradingTimestamp(serviceSafe: Address, timestamp: BigInt): void {
  let portfolio = AgentPortfolio.load(serviceSafe as Bytes)
  if (portfolio != null && portfolio.firstTradingTimestamp.equals(BigInt.zero())) {
    portfolio.firstTradingTimestamp = timestamp
    portfolio.save()
    
    log.info("PORTFOLIO: Set first trading timestamp for service {} to {}", [
      serviceSafe.toHexString(),
      timestamp.toString()
    ])
  }
}
