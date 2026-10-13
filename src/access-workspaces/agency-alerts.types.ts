export interface AlertResponse<T> {
  success: true;
  message: string;
  data: T;
}

export interface AlertOrganization {
  organizationId: string;
  name: string;
  slug: string | null;
  logoUrl: string | null;
}

export interface AlertOrganizationSearch {
  organizations: (AlertOrganization & { following: boolean })[];
}

export interface AlertFollow extends AlertOrganization {
  followedAt: string;
  deliveryPaused: boolean;
}

export interface AgencyAlertState {
  recipientEmail: string | null;
  emailAvailable: boolean;
  enabled: boolean;
  follows: AlertFollow[];
  followCount: number;
}

export interface AlertJob {
  shortUUID: string;
  title: string;
  location: string | null;
}

export interface AlertClaim {
  id: string;
  followId: string;
  workspaceId: string;
  userId: string;
  recipientEmail: string;
  organizationName: string;
}
