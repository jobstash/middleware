export interface UserOrgAffiliationRequest {
  wallet: string;
  orgId: string;
  status: "pending" | "approved" | "rejected";
  timestamp: number;
}
