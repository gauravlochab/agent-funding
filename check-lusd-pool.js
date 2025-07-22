// Quick check of LUSD/USDC pool on Optimism
const poolAddress = "0xfd07b75bf9d23c23df1a979101e63e9a212728eb";

console.log("LUSD/USDC Pool:", poolAddress);
console.log("\nExpected token addresses:");
console.log("LUSD: 0xc40F949F8a4e094D1b49a23ea9241D289B7b2819");
console.log("USDC: 0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85");

console.log("\nTo verify on Etherscan:");
console.log(`https://optimistic.etherscan.io/address/${poolAddress}#readContract`);
console.log("\nCheck:");
console.log("- token0() method");
console.log("- token1() method");
console.log("- slot0() for current price");
