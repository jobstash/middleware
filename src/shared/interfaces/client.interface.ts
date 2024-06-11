import { ATSPreferences } from "./ats-preferences.interface";

export interface ATSClient {
  id: string;
  orgId: string;
  hasWebhooks: boolean;
  preferences: ATSPreferences | null;
}
