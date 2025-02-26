export interface PaymentEventData {
  api_version: string;
  created_at: string;
  data: Data;
  id: string;
  type: string;
}

export interface Data {
  id: string;
  pricing: Pricing;
  metadata: Metadata;
  created_at: string;
  hosted_url: string;
  pricing_type: string;
}

export interface Pricing {
  local: Local;
}

export interface Local {
  amount: string;
  currency: string;
}

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
    | "subscription-upgrade"
    | "subscription-downgrade";
  calldata: string;
}

export interface PaymentEvent {
  event: PaymentEventData;
}
