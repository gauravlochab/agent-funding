import { ethereum, log } from "@graphprotocol/graph-ts"
import { Safe } from "../generated/templates"
import { Service } from "../generated/schema"

// Bootstrap handler to create Safe datasource instances for existing services
export function handleSafeBootstrap(block: ethereum.Block): void {
  log.info("SAFE BOOTSTRAP: Starting Safe datasource creation for existing services at block {}", [
    block.number.toString()
  ])
  
  // Load all services and create Safe datasource instances
  let services = Service.load(null)
  
  // Note: Since we can't iterate over all entities easily in AssemblyScript,
  // we'll need to manually list known service safes that need ETH tracking
  
  // Known service safes that need ETH tracking
  let serviceSafes = [
    "0xc8e264f402ae94f69bdef8b1f035f7200cd2b0c7", // Service 25
    "0xf38820f03313535a4024dccbe2689aa7cc158f5c", // Service 28
    "0xeb4b51e304a2bbfdb0f3003fd2ac6375518f7a32", // Service 26
    "0xe8c7bbf632bff7239e53dab45086ac14d6974bac", // Service 33
    "0xe4eaf37b1726634935f679a8f3e00ec2e4e650a0", // Service 20
    "0xd32613ed605be41d9c7fbc85f2ccb4fba59778ac", // Service 24
    "0xc7d89ed318cac02cf9719c50157541df2504ea3a", // Service 23
    "0xb0df5a11c1186201a588353f322128cb1fc1c6c7", // Service 27
    "0xa11417aebf3932ee895008ede8ea95616f488bcf", // Service 21
    "0x9f3abfc3301093f39c2a137f87c525b4a0832ba9", // Service 29
    "0x06d1f8cdb1f126f541e3dc28e7db200b5ebe00eb", // Service 18
    "0x9c5de7ad616aa088971b97ec6ad00f14abf73b2d", // Service 19
    "0x2a60adb8b0e6f27a9b88beca6a3a5e8b27a0d7b6", // Service 22
    "0xac8fb58f628e896c2b5e39c33d0f4e21e31a3e07", // Service 30
    "0xced32b616ad09c17e98bb2848ae16528e1c7a53d", // Service 31
    "0x080c2cf4090b24a31ad039f91b59e731fe37f7e5", // Service 32
    "0x5e6ad7767aae6c872fc969b30fced387bc5a43e9", // Service 34
    "0x9a088c9c8bf96b14e0f6fa86e6e6ad5bef013073", // Service 35
    "0xdfa40e24fb17fcd30fdf78fa97e732ffa55a6797", // Service 36
    "0x4c9f7f09c09bc9b7b6c0c3fb0c90c18b1e17b1ec", // Service 37
    "0xf3cbec2bb558f3e686bb8088bb2c7c98f8a9b8dc", // Service 38
    "0x89bb48fc2ced45abfadf00f4d5d5c2b01e95e3a7", // Service 39
    "0x088e7c6f1a56ce87837e9ca7c96fba1c638b6879"  // Service 40
  ]
  
  let count = 0
  for (let i = 0; i < serviceSafes.length; i++) {
    let safeAddress = serviceSafes[i]
    
    // Create Safe datasource instance
    Safe.create(ethereum.Address.fromString(safeAddress))
    count = count + 1
    
    log.info("SAFE BOOTSTRAP: Created Safe datasource for service safe: {}", [safeAddress])
  }
  
  log.info("SAFE BOOTSTRAP: Completed - created {} Safe datasource instances", [count.toString()])
}
