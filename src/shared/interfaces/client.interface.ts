import { ATSPreferences } from "./ats-preferences.interface";

export interface ATSClient {
  id: string;
  name: string;
  orgId: string | null;
  hasWebhooks: boolean;
  preferences: ATSPreferences | null;
}
