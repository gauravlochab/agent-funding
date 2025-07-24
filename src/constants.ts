import { Address } from "@graphprotocol/graph-ts"

// Velodrome CL
export const VELO_MANAGER = Address.fromString("0x416b433906b1B72FA758e166e239c43d68dC6F29")
export const VELO_FACTORY = Address.fromString("0x548118C7E0B865C2CfA94D15EC86B666468ac758")

// Uniswap V3  
export const UNI_V3_MANAGER = Address.fromString("0xC36442b4a4522E871399CD717aBDD847Ab11FE88")
export const UNI_V3_FACTORY = Address.fromString("0x1F98431c8aD98523631AE4a59f267346ea31F984")

// Note: SAFE_ADDRESS has been removed as we now track multiple services dynamically via ServiceRegistryL2
