import { ATSPreferences } from "./ats-preferences.interface";

export interface ATSClient {
  id: string;
  name: string;
  orgId: string;
  hasWebhooks: boolean;
  preferences: ATSPreferences | null;
}
