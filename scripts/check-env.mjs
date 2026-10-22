const required = [
  "DATABASE_URL",
  "RPC_URL",
  "LAUNCH_FACTORY_ADDRESS",
  "STOCK_REGISTRY_ADDRESS",
  "FEE_VAULT_ADDRESS",
  "TREASURY_ADDRESS",
  "ETH_USD_ORACLE_ADDRESS",
];
let errors = [];
for (const k of required) {
  const v = process.env[k];
  if (!v) errors.push(k + " missing");
  else if (k.endsWith("_ADDRESS") && !/^0x[0-9a-fA-F]{40}$/.test(v))
    errors.push(k + " invalid");
}
if (process.env.NEXT_PUBLIC_CHAIN_ID !== "4663")
  errors.push("NEXT_PUBLIC_CHAIN_ID must be 4663");
for (const k of Object.keys(process.env))
  if (
    k.startsWith("NEXT_PUBLIC_") &&
    /PRIVATE|SECRET|DATABASE|DEPLOYER/.test(k)
  )
    errors.push("Privileged public variable: " + k);
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(
  "Environment shape valid. This does not verify contracts, issuer approval or audit readiness.",
);
