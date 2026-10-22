import { parseAbi, isAddress, type Address } from "viem";
export const factoryAbi = parseAbi([
  "event LaunchCreated(address indexed token,address indexed market,address indexed creator,address quote,uint8 feePercent,uint256 supply,string metadataURI)",
  "function creationFee() view returns(uint256)",
  "function launch(string name,string symbol,uint256 supply,address quote,uint8 fee,string metadataURI) payable returns(address token,address market)",
]);
export const marketAbi = parseAbi([
  "event Buy(address indexed trader,uint256 grossQuote,uint256 tokensOut,uint256 fee,bool amm)",
  "event Sell(address indexed trader,uint256 tokensIn,uint256 netQuote,uint256 fee,bool amm)",
  "event Graduation(uint256 quoteReserve,uint256 tokenReserve,uint256 burned)",
  "function quoteBuy(uint256 gross) view returns(uint256 out,uint256 fee)",
  "function quoteSell(uint256 input) view returns(uint256 net,uint256 fee)",
  "function buy(uint256 gross,uint256 minOut,uint256 deadline) returns(uint256 out)",
  "function sell(uint256 input,uint256 minOut,uint256 deadline) returns(uint256 net)",
  "function graduate()",
  "function realQuote() view returns(uint256)",
  "function graduated() view returns(bool)",
]);
export const vaultAbi = parseAbi([
  "event FeesAccrued(address indexed token,uint256 creatorAmount,uint256 protocolAmount)",
  "event FeesClaimed(address indexed creator,address indexed token,uint256 amount)",
  "function getClaimableFees(address creator,address token) view returns(uint256)",
  "function claimFees(address token)",
  "function claimMultiple(address[] tokens)",
]);
export function checkedAddress(value: string | undefined): Address {
  if (!value || !isAddress(value))
    throw Error("A verified deployment address is required");
  return value;
}
export function minimumOutput(quote: bigint, slippageBps: number) {
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 5000)
    throw Error("Invalid slippage");
  return (quote * BigInt(10000 - slippageBps)) / 10000n;
}
export function buy(x: bigint, y: bigint, gross: bigint, feePercent: number) {
  if (
    x <= 0n ||
    y <= 0n ||
    gross <= 0n ||
    feePercent < 1 ||
    feePercent > 10 ||
    !Number.isInteger(feePercent)
  )
    throw Error("Invalid input");
  const fee = (gross * BigInt(feePercent)) / 100n;
  return { out: (x * (gross - fee)) / (y + gross - fee), fee };
}
export function sell(x: bigint, y: bigint, input: bigint, feePercent: number) {
  if (
    x <= 0n ||
    y <= 0n ||
    input <= 0n ||
    feePercent < 1 ||
    feePercent > 10 ||
    !Number.isInteger(feePercent)
  )
    throw Error("Invalid input");
  const gross = (y * input) / (x + input),
    fee = (gross * BigInt(feePercent)) / 100n;
  return { out: gross - fee, fee, gross };
}
