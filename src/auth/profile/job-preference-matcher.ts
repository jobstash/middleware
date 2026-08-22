import {
  JobForMe,
  JobPreferences,
  WorkLocationOption,
} from "src/shared/interfaces";

const utcOffsetMinutes = (ianaTimezone: string, at: Date): number | null => {
  try {
    const part = new Intl.DateTimeFormat("en", {
      timeZone: ianaTimezone,
      timeZoneName: "longOffset",
    })
      .formatToParts(at)
      .find(item => item.type === "timeZoneName")?.value;
    if (!part || part === "GMT" || part === "UTC") return 0;
    const match = part.match(/(?:GMT|UTC)([+-])(\d{1,2})(?::(\d{2}))?/);
    if (!match) return null;
    const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
    return match[1] === "-" ? -minutes : minutes;
  } catch {
    return null;
  }
};

const includesInsensitive = (values: string[], expected: string): boolean =>
  values.some(value => value.toLowerCase() === expected.toLowerCase());

export interface TeamCollaborationBand {
  minimumUtcMinute: number;
  maximumUtcMinute: number;
}

const utcTime = (minute: number): string =>
  `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(
    minute % 60,
  ).padStart(2, "0")}`;

export const matchWorkLocationOptions = (
  job: Record<string, unknown>,
  options: WorkLocationOption[],
  preferences: JobPreferences,
  at = new Date(),
  teamCollaborationBand: TeamCollaborationBand | null = null,
): JobForMe | null => {
  for (const option of options) {
    if (!preferences.acceptableWorkModes.includes(option.mode)) continue;
    if (
      (option.mode === "remote" || option.mode === "remote_or_office") &&
      !option.employerAuthoredRemoteEvidence
    ) {
      continue;
    }

    const reasons: string[] = [];
    const needsChecking: string[] = [];

    if (option.scope === "global") {
      reasons.push("The employer says this option is open worldwide.");
    } else if (option.scope === "country_list") {
      if (!preferences.residenceCountry) {
        needsChecking.push("Add your country to confirm location eligibility.");
      } else if (
        !includesInsensitive(option.countries, preferences.residenceCountry)
      ) {
        continue;
      } else {
        reasons.push(`The employer includes ${preferences.residenceCountry}.`);
      }
    } else if (option.scope === "region_list") {
      if (!preferences.residenceRegion) {
        needsChecking.push("Add your region to confirm location eligibility.");
      } else if (
        !includesInsensitive(option.regions, preferences.residenceRegion)
      ) {
        continue;
      } else {
        reasons.push(`The employer includes ${preferences.residenceRegion}.`);
      }
    } else {
      needsChecking.push("The employer has not stated the geographic scope.");
    }

    if (
      option.minimumUtcOffsetMinutes !== null &&
      option.maximumUtcOffsetMinutes !== null
    ) {
      const offset = preferences.ianaTimezone
        ? utcOffsetMinutes(preferences.ianaTimezone, at)
        : null;
      if (offset === null) {
        needsChecking.push("Add a timezone to check collaboration hours.");
      } else if (
        option.timezonePreferenceStrength === "required" &&
        (offset < option.minimumUtcOffsetMinutes ||
          offset > option.maximumUtcOffsetMinutes)
      ) {
        continue;
      } else if (
        offset >= option.minimumUtcOffsetMinutes &&
        offset <= option.maximumUtcOffsetMinutes
      ) {
        reasons.push("Your timezone is within the stated collaboration band.");
      } else {
        needsChecking.push(
          "Your timezone is outside the employer's preferred band.",
        );
      }
    }

    if (option.workAuthorization) {
      if (preferences.workAuthorizations.length === 0) {
        needsChecking.push(
          "Add your work authorization to confirm legal eligibility.",
        );
      } else if (
        !includesInsensitive(
          preferences.workAuthorizations,
          option.workAuthorization,
        )
      ) {
        continue;
      } else {
        reasons.push("Your saved work authorization matches this option.");
      }
    }

    if (option.residencyRequirement && !preferences.residenceCountry) {
      needsChecking.push("A residency requirement still needs checking.");
    }

    if (
      preferences.needsSponsorship === true &&
      option.sponsorship === "unavailable"
    ) {
      continue;
    }
    if (
      preferences.needsSponsorship === true &&
      option.sponsorship === "unstated"
    ) {
      needsChecking.push(
        "The employer has not stated whether sponsorship is available.",
      );
    }
    if (preferences.needsSponsorship === null) {
      needsChecking.push(
        "Set your sponsorship preference to confirm legal eligibility.",
      );
    }

    reasons.unshift(
      option.mode === "remote_or_office"
        ? "The employer offers remote work or an office option."
        : `The ${option.mode} option matches a work mode you accept.`,
    );
    const optionalSignals =
      preferences.useInferredCollaborationHours && teamCollaborationBand
        ? [
            `Recent team activity is broadly concentrated between ${utcTime(
              teamCollaborationBand.minimumUtcMinute,
            )} and ${utcTime(
              teamCollaborationBand.maximumUtcMinute,
            )} UTC. This is context, not a work requirement.`,
          ]
        : [];
    return {
      job,
      option,
      confirmed: needsChecking.length === 0,
      explanation: reasons.join(" "),
      needsChecking,
      optionalSignals,
    };
  }
  return null;
};
