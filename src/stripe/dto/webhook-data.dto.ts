export interface JobPromotionMetadata {
  shortUUID: string;
}

export interface SubscriptionMetadata {
  wallet: string;
  orgId: string;
  jobstash: string;
  veri: string;
  stashAlert: boolean;
  extraSeats: number;
  amount: number;
}

export interface Metadata {
  action:
    | "job-promotion"
    | "new-subscription"
    | "subscription-renewal"
    | "subscription-change";
  calldata: string;
}
