export type RegistryAsset = readonly [
  string,
  string,
  bigint,
  number,
  boolean,
  boolean,
  string,
  bigint,
  bigint,
];
export function registryApproval(asset: RegistryAsset) {
  if (!asset[4]) return "not-approved" as const;
  if (asset[5]) return "suspended" as const;
  return "approved" as const;
}
export function approvalSummary(
  asset: RegistryAsset | undefined,
  oracleHealthy: boolean | null,
) {
  if (!asset)
    return {
      approvalStatus: "unavailable" as const,
      approved: false,
      oracleHealthy: null,
      canLaunch: false,
    };
  const approvalStatus = registryApproval(asset);
  return {
    approvalStatus,
    approved: approvalStatus === "approved",
    oracleHealthy,
    canLaunch: approvalStatus === "approved" && oracleHealthy === true,
  };
}
