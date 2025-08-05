import { BigDecimal, BigInt, Bytes, Address, ethereum, log } from "@graphprotocol/graph-ts"
import { OlasRewards, Service, ServiceIndex } from "../generated/schema"
import { 
  Checkpoint,
  ServiceStaked,
  ServiceUnstaked
} from "../generated/templates/StakingProxy/StakingProxy"
import { getOlasPrice, convertOlasToUSD, updateAveragePrice } from "./olasPrice"
import { calculatePortfolioMetrics } from "./helpers"

/**
 * Handle OLAS Checkpoint event - main reward distribution
 * @param event Checkpoint event from StakingProxy
 */
export function handleOlasCheckpoint(event: Checkpoint): void {
  log.info("🎯 OLAS_REWARDS: ========== CHECKPOINT EVENT DETECTED ==========", [])
  log.info("🎯 OLAS_REWARDS: Block: {}, Tx: {}", [
    event.block.number.toString(),
    event.transaction.hash.toHexString()
  ])
  log.info("🎯 OLAS_REWARDS: Epoch: {}, Available Rewards: {}, Services Count: {}", [
    event.params.epoch.toString(),
    event.params.availableRewards.toString(),
    event.params.serviceIds.length.toString()
  ])
  
  // Log all service IDs in this checkpoint
  for (let i = 0; i < event.params.serviceIds.length; i++) {
    log.info("🎯 OLAS_REWARDS: Service ID {} - Reward: {}", [
      event.params.serviceIds[i].toString(),
      event.params.rewards[i].toString()
    ])
  }
  
  // Extract event parameters
  let epoch = event.params.epoch
  let availableRewards = event.params.availableRewards
  let serviceIds = event.params.serviceIds
  let rewards = event.params.rewards
  let epochLength = event.params.epochLength
  
  // Validate arrays have same length
  if (serviceIds.length != rewards.length) {
    log.error("OLAS_REWARDS: Array length mismatch - serviceIds: {}, rewards: {}", [
      serviceIds.length.toString(),
      rewards.length.toString()
    ])
    return
  }
  
  // CRITICAL FILTERING LOGIC: Only update services we track
  for (let i = 0; i < serviceIds.length; i++) {
    let serviceId = serviceIds[i]
    let rewardAmount = rewards[i]
    
    // Skip if reward is zero
    if (rewardAmount.equals(BigInt.zero())) {
      log.debug("OLAS_REWARDS: Zero reward for service {}, skipping", [serviceId.toString()])
      continue
    }
    
    let serviceIndexId = Bytes.fromUTF8(serviceId.toString())
    let serviceIndex = ServiceIndex.load(serviceIndexId)
    
    if (serviceIndex !== null) {
      let service = Service.load(serviceIndex.currentServiceSafe)
      if (service !== null && service.isActive) {
        // THIS IS A TRACKED OPTIMUS SERVICE - update rewards
        log.info("OLAS_REWARDS: Updating rewards for tracked service {} (ID: {}) - reward: {} OLAS", [
          service.serviceSafe.toHexString(),
          serviceId.toString(),
          rewardAmount.toString()
        ])
        
        updateOlasRewards(service.serviceSafe, rewardAmount, event.block)
        calculatePortfolioMetrics(Address.fromBytes(service.serviceSafe), event.block)
      } else {
        log.debug("OLAS_REWARDS: Service {} not active, skipping", [serviceId.toString()])
      }
    } else {
      log.debug("OLAS_REWARDS: Service {} not tracked, skipping", [serviceId.toString()])
    }
  }
}

/**
 * Handle OLAS ServiceStaked event
 * @param event ServiceStaked event from StakingProxy
 */
export function handleOlasServiceStaked(event: ServiceStaked): void {
  log.info("OLAS_REWARDS: ServiceStaked event at block {} - serviceId: {}", [
    event.block.number.toString(),
    event.params.serviceId.toString()
  ])
  
  // Extract event parameters
  let epoch = event.params.epoch
  let serviceId = event.params.serviceId
  let owner = event.params.owner
  let multisig = event.params.multisig
  let nonces = event.params.nonces
  
  // Check if this is a tracked service
  let serviceIndexId = Bytes.fromUTF8(serviceId.toString())
  let serviceIndex = ServiceIndex.load(serviceIndexId)
  
  if (serviceIndex !== null) {
    let service = Service.load(serviceIndex.currentServiceSafe)
    if (service !== null && service.isActive) {
      log.info("OLAS_REWARDS: Service {} staked (ID: {}) - multisig: {}", [
        service.serviceSafe.toHexString(),
        serviceId.toString(),
        multisig.toHexString()
      ])
      
      // Initialize or update OLAS rewards entity
      let olasRewards = getOrCreateOlasRewards(service.serviceSafe, event.block)
      
      // Update staking metadata
      olasRewards.lastRewardTimestamp = event.block.timestamp
      olasRewards.lastRewardBlock = event.block.number
      olasRewards.save()
      
      log.info("OLAS_REWARDS: Service {} staking recorded", [service.serviceSafe.toHexString()])
    } else {
      log.debug("OLAS_REWARDS: Service {} not active or not found, skipping staking event", [serviceId.toString()])
    }
  } else {
    log.debug("OLAS_REWARDS: Service {} not tracked, skipping staking event", [serviceId.toString()])
  }
}

/**
 * Handle OLAS ServiceUnstaked event
 * @param event ServiceUnstaked event from StakingProxy
 */
export function handleOlasServiceUnstaked(event: ServiceUnstaked): void {
  log.info("OLAS_REWARDS: ServiceUnstaked event at block {} - serviceId: {}", [
    event.block.number.toString(),
    event.params.serviceId.toString()
  ])
  
  // Extract event parameters
  let epoch = event.params.epoch
  let serviceId = event.params.serviceId
  let owner = event.params.owner
  let multisig = event.params.multisig
  let nonces = event.params.nonces
  let reward = event.params.reward
  let availableRewards = event.params.availableRewards
  
  // Check if this is a tracked service
  let serviceIndexId = Bytes.fromUTF8(serviceId.toString())
  let serviceIndex = ServiceIndex.load(serviceIndexId)
  
  if (serviceIndex !== null) {
    let service = Service.load(serviceIndex.currentServiceSafe)
    if (service !== null && service.isActive) {
      log.info("OLAS_REWARDS: Service {} unstaked with reward {} OLAS (ID: {}) - multisig: {}", [
        service.serviceSafe.toHexString(),
        reward.toString(),
        serviceId.toString(),
        multisig.toHexString()
      ])
      
      // Update final rewards if any
      if (reward.gt(BigInt.zero())) {
        updateOlasRewards(service.serviceSafe, reward, event.block)
        calculatePortfolioMetrics(Address.fromBytes(service.serviceSafe), event.block)
      }
      
      // Reset staked amount
      let olasRewards = getOrCreateOlasRewards(service.serviceSafe, event.block)
      olasRewards.currentOlasStaked = BigInt.zero()
      olasRewards.lastRewardTimestamp = event.block.timestamp
      olasRewards.lastRewardBlock = event.block.number
      olasRewards.save()
      
      log.info("OLAS_REWARDS: Service {} unstaking recorded, staked amount reset", [service.serviceSafe.toHexString()])
    } else {
      log.debug("OLAS_REWARDS: Service {} not active or not found, skipping unstaking event", [serviceId.toString()])
    }
  } else {
    log.debug("OLAS_REWARDS: Service {} not tracked, skipping unstaking event", [serviceId.toString()])
  }
}

/**
 * Update OLAS rewards for a service
 * @param serviceSafe Service safe address
 * @param rewardAmount OLAS reward amount in wei
 * @param block Block information
 */
function updateOlasRewards(serviceSafe: Bytes, rewardAmount: BigInt, block: ethereum.Block): void {
  if (rewardAmount.equals(BigInt.zero())) {
    return
  }
  
  log.info("OLAS_REWARDS: Updating rewards for {} - amount: {} OLAS", [
    serviceSafe.toHexString(),
    rewardAmount.toString()
  ])
  
  let olasRewards = getOrCreateOlasRewards(serviceSafe, block)
  
  // Add to cumulative rewards
  olasRewards.olasRewardsEarned = olasRewards.olasRewardsEarned.plus(rewardAmount)
  
  // Convert to USD
  let rewardUSD = convertOlasToUSD(rewardAmount, block.timestamp)
  let currentPrice = getOlasPrice(block.timestamp)
  
  // Update USD value and average price
  olasRewards.olasRewardsEarnedUSD = olasRewards.olasRewardsEarnedUSD.plus(rewardUSD)
  olasRewards.averageOlasPrice = updateAveragePrice(
    olasRewards.averageOlasPrice,
    currentPrice,
    BigDecimal.fromString("0.1") // 10% weight for new price
  )
  
  // Update metadata
  olasRewards.lastRewardTimestamp = block.timestamp
  olasRewards.lastRewardBlock = block.number
  olasRewards.lastPriceUpdate = block.timestamp
  
  olasRewards.save()
  
  log.info("OLAS_REWARDS: Updated - Total: {} OLAS (${} USD), Avg Price: ${}", [
    olasRewards.olasRewardsEarned.toString(),
    olasRewards.olasRewardsEarnedUSD.toString(),
    olasRewards.averageOlasPrice.toString()
  ])
}

/**
 * Get or create OLAS rewards entity for a service
 * @param serviceSafe Service safe address
 * @param block Block information
 * @returns OlasRewards entity
 */
function getOrCreateOlasRewards(serviceSafe: Bytes, block: ethereum.Block): OlasRewards {
  let olasRewards = OlasRewards.load(serviceSafe)
  
  if (olasRewards == null) {
    log.info("OLAS_REWARDS: Creating new OLAS rewards entity for {}", [serviceSafe.toHexString()])
    
    olasRewards = new OlasRewards(serviceSafe)
    
    // Load service to establish relationship
    let service = Service.load(serviceSafe)
    if (service == null) {
      log.error("OLAS_REWARDS: Service not found for {}", [serviceSafe.toHexString()])
      // Create a minimal service entity to avoid null reference
      service = new Service(serviceSafe)
      service.serviceId = BigInt.zero()
      service.operatorSafe = serviceSafe
      service.serviceSafe = serviceSafe
      service.latestRegistrationBlock = block.number
      service.latestRegistrationTimestamp = block.timestamp
      service.latestRegistrationTxHash = Bytes.empty()
      service.latestMultisigBlock = block.number
      service.latestMultisigTimestamp = block.timestamp
      service.latestMultisigTxHash = Bytes.empty()
      service.isActive = true
      service.createdAt = block.timestamp
      service.updatedAt = block.timestamp
      service.positionIds = []
      service.save()
    }
    
    olasRewards.service = service.id
    
    // Initialize with zero values
    olasRewards.currentOlasStaked = BigInt.zero()
    olasRewards.olasRewardsEarned = BigInt.zero()
    olasRewards.olasRewardsEarnedUSD = BigDecimal.zero()
    olasRewards.lastRewardTimestamp = block.timestamp
    olasRewards.lastRewardBlock = block.number
    olasRewards.lastPriceUpdate = block.timestamp
    olasRewards.averageOlasPrice = getOlasPrice(block.timestamp)
  }
  
  return olasRewards
}
