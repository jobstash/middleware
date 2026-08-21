export type WorkMode = "remote" | "hybrid" | "onsite" | "remote_or_office";

export interface JobPreferences {
  residenceCountry: string | null;
  residenceRegion: string | null;
  ianaTimezone: string | null;
  workAuthorizations: string[];
  needsSponsorship: boolean | null;
  acceptableWorkModes: WorkMode[];
  travelTolerance: string | null;
  useInferredCollaborationHours: boolean;
}

export interface WorkLocationOption {
  mode: WorkMode;
  scope: "global" | "region_list" | "country_list" | "unstated";
  countries: string[];
  regions: string[];
  minimumUtcOffsetMinutes: number | null;
  maximumUtcOffsetMinutes: number | null;
  timezonePreferenceStrength: "required" | "preferred" | "unstated";
  residencyRequirement: string | null;
  workAuthorization: string | null;
  sponsorship: "available" | "unavailable" | "unstated";
  officeLocation: Record<string, unknown> | null;
  attendanceCadence: string | null;
  confidence: number;
  employerAuthoredRemoteEvidence: boolean;
  evidence: {
    text: string;
    source:
      | "job_description"
      | "career_policy"
      | "employer_metadata"
      | "aggregator_metadata";
  }[];
}

export interface JobForMe {
  job: Record<string, unknown>;
  option: WorkLocationOption;
  confirmed: boolean;
  explanation: string;
  needsChecking: string[];
  optionalSignals: string[];
}
