import { 
  RegisterInstance,
  CreateMultisigWithAgents
} from "../generated/ServiceRegistryL2/ServiceRegistryL2"
import { 
  Service, 
  ServiceRegistration, 
  ServiceIndex
} from "../generated/schema"
import { Safe } from "../generated/templates"
import { BigInt, Bytes, store, log } from "@graphprotocol/graph-ts"

const OPTIMUS_AGENT_ID = BigInt.fromI32(40)

// Log initialization
log.info("SERVICE DISCOVERY: ServiceRegistry handlers initialized - Looking for OPTIMUS_AGENT_ID: {}", [
  OPTIMUS_AGENT_ID.toString()
])

export function handleRegisterInstance(event: RegisterInstance): void {
  log.info("=== SERVICE DISCOVERY START: RegisterInstance ===", [])
  log.info("SERVICE DISCOVERY: Event Details - TxHash: {}, LogIndex: {}", [
    event.transaction.hash.toHexString(),
    event.logIndex.toString()
  ])
  log.info("SERVICE DISCOVERY: Event Params - AgentID: {}, ServiceID: {}, Operator: {}, AgentInstance: {}", [
    event.params.agentId.toString(),
    event.params.serviceId.toString(),
    event.params.operator.toHexString(),
    event.params.agentInstance ? event.params.agentInstance.toHexString() : "null"
  ])
  log.info("SERVICE DISCOVERY: Block Info - Number: {}, Timestamp: {}", [
    event.block.number.toString(),
    event.block.timestamp.toString()
  ])
  
  // Filter for Optimus agents only
  if (!event.params.agentId.equals(OPTIMUS_AGENT_ID)) {
    log.info("SERVICE DISCOVERY: Skipping non-Optimus agent - AgentID: {} (looking for {})", [
      event.params.agentId.toString(),
      OPTIMUS_AGENT_ID.toString()
    ])
    return
  }
  
  log.info("SERVICE: ✅ New Optimus service registered - ID: {}, Operator: {}, Block: {}", [
    event.params.serviceId.toString(),
    event.params.operator.toHexString(),
    event.block.number.toString()
  ])
  
  let serviceId = event.params.serviceId
  let tempId = Bytes.fromUTF8(serviceId.toString())
  
  log.info("SERVICE DISCOVERY: Creating ServiceRegistration entity with ID: {}", [
    tempId.toHexString()
  ])
  
  // Always overwrite with latest registration
  let registration = new ServiceRegistration(tempId)
  registration.serviceId = serviceId
  registration.operatorSafe = event.params.operator
  registration.registrationBlock = event.block.number
  registration.registrationTimestamp = event.block.timestamp
  registration.registrationTxHash = event.transaction.hash
  registration.save()
  
  log.info("SERVICE DISCOVERY: ServiceRegistration saved successfully for service ID: {}", [
    serviceId.toString()
  ])
  
  // Update existing service if it exists
  let serviceIndex = ServiceIndex.load(tempId)
  if (serviceIndex != null) {
    let service = Service.load(serviceIndex.currentServiceSafe)
    if (service != null) {
      service.operatorSafe = event.params.operator
      service.latestRegistrationBlock = event.block.number
      service.latestRegistrationTimestamp = event.block.timestamp
      service.latestRegistrationTxHash = event.transaction.hash
      service.updatedAt = event.block.timestamp
      
      // Ensure positionIds is initialized (for backward compatibility)
      if (service.positionIds == null) {
        service.positionIds = []
      }
      
      service.save()
    }
  }
  
  log.info("=== SERVICE DISCOVERY END: RegisterInstance ===", [])
}

export function handleCreateMultisigWithAgents(event: CreateMultisigWithAgents): void {
  log.info("=== SERVICE DISCOVERY START: CreateMultisigWithAgents ===", [])
  
  let serviceId = event.params.serviceId
  let multisig = event.params.multisig
  
  log.info("SERVICE DISCOVERY: Event Details - TxHash: {}, LogIndex: {}", [
    event.transaction.hash.toHexString(),
    event.logIndex.toString()
  ])
  log.info("SERVICE DISCOVERY: Event Params - ServiceID: {}, Multisig: {}", [
    serviceId.toString(),
    multisig.toHexString()
  ])
  log.info("SERVICE DISCOVERY: Block Info - Number: {}, Timestamp: {}", [
    event.block.number.toString(),
    event.block.timestamp.toString()
  ])
  
  let tempId = Bytes.fromUTF8(serviceId.toString())
  
  let registration = ServiceRegistration.load(tempId)
  if (registration == null) {
    log.info("SERVICE DISCOVERY: No registration found for service {} - skipping multisig creation", [
      serviceId.toString()
    ])
    return // Not an Optimus service
  }
  
  log.info("SERVICE DISCOVERY: Found registration for service {} - proceeding with multisig creation", [
    serviceId.toString()
  ])
  
  // Check if we already have a service for this serviceId
  let serviceIndex = ServiceIndex.load(tempId)
  if (serviceIndex != null) {
    // Mark old service as inactive
    let oldService = Service.load(serviceIndex.currentServiceSafe)
    if (oldService != null) {
      log.info("SERVICE: Previous service marked inactive - Safe: {}", [
        oldService.serviceSafe.toHexString()
      ])
      oldService.isActive = false
      
      // Ensure positionIds is initialized (for backward compatibility)
      if (oldService.positionIds == null) {
        oldService.positionIds = []
      }
      
      oldService.save()
    }
  } else {
    // Create new index
    serviceIndex = new ServiceIndex(tempId)
    serviceIndex.serviceId = serviceId
  }
  
  // Create new service with multisig address as ID
  let service = new Service(multisig)
  service.serviceId = serviceId
  service.operatorSafe = registration.operatorSafe
  service.serviceSafe = multisig
  
  // Initialize positionIds as empty array
  service.positionIds = []
  
  // Set registration data
  service.latestRegistrationBlock = registration.registrationBlock
  service.latestRegistrationTimestamp = registration.registrationTimestamp
  service.latestRegistrationTxHash = registration.registrationTxHash
  
  // Set multisig data
  service.latestMultisigBlock = event.block.number
  service.latestMultisigTimestamp = event.block.timestamp
  service.latestMultisigTxHash = event.transaction.hash
  
  service.isActive = true
  service.createdAt = event.block.timestamp
  service.updatedAt = event.block.timestamp
  service.save()
  
  // Update index to point to new service
  serviceIndex.currentServiceSafe = multisig
  serviceIndex.save()
  
  log.info("SERVICE: ✅ Multisig created - Service ID: {}, Safe: {}, Active: {}, Operator: {}", [
    serviceId.toString(),
    multisig.toHexString(),
    service.isActive.toString(),
    service.operatorSafe.toHexString()
  ])
  
  log.info("SERVICE DISCOVERY: Service entity saved successfully - can now track funding and positions for safe: {}", [
    multisig.toHexString()
  ])
  
  // Create Safe datasource instance to track ETH transfers
  Safe.create(multisig)
  log.info("SERVICE DISCOVERY: Created Safe datasource instance for tracking ETH transfers to: {}", [
    multisig.toHexString()
  ])
  
  log.info("=== SERVICE DISCOVERY END: CreateMultisigWithAgents ===", [])
}

// Helper functions for finding services
export function findServiceByServiceId(serviceId: BigInt): Service | null {
  let tempId = Bytes.fromUTF8(serviceId.toString())
  let serviceIndex = ServiceIndex.load(tempId)
  
  if (serviceIndex == null || !serviceIndex.currentServiceSafe) {
    return null
  }
  
  return Service.load(serviceIndex.currentServiceSafe)
}

export function findActiveServiceByServiceId(serviceId: BigInt): Service | null {
  let service = findServiceByServiceId(serviceId)
  return (service != null && service.isActive) ? service : null
}
