import {
  JobForMe,
  JobPreferences,
  WorkArrangementClassification,
  WorkLocationOption,
} from "src/shared/interfaces";

const includesInsensitive = (
  values: string[] | null | undefined,
  expected: string,
): boolean =>
  (values ?? []).some(
    value => value.trim().toLowerCase() === expected.trim().toLowerCase(),
  );

type WorkRegion = WorkLocationOption["includedRegions"][number];

const countrySet = (codes: string): ReadonlySet<string> =>
  new Set(codes.split(/\s+/).filter(Boolean));

const EU = countrySet(
  "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE",
);
const EUROPE = countrySet(
  "AL AD AM AT AZ BY BE BA BG HR CY CZ DK EE FI FR GE DE GR HU IS IE IT XK LV LI LT LU MT MD MC ME NL MK NO PL PT RO RU SM RS SK SI ES SE CH TR UA GB VA",
);
const LATAM = countrySet(
  "AR BO BR CL CO CR CU DO EC SV GT HT HN MX NI PA PY PE PR UY VE BZ GY SR GF",
);
const AMER = countrySet(
  "AG AR BS BB BZ BO BR CA CL CO CR CU DM DO EC SV GD GT GY HT HN JM MX NI PA PY PE KN LC VC SR TT US UY VE GL PR GF",
);
const APAC = countrySet(
  "AF AU BD BT BN KH CN FJ HK IN ID JP KI LA MO MY MV MH FM MN MM NR NP NZ KP PK PW PG PH WS SG SB KR LK TW TH TL TO TV VU VN",
);
const MIDDLE_EAST = countrySet("BH EG IR IQ IL JO KW LB OM PS QA SA SY AE YE");
const AFRICA = countrySet(
  "DZ AO BJ BW BF BI CV CM CF TD KM CD CG CI DJ EG GQ ER SZ ET GA GM GH GN GW KE LS LR LY MG MW ML MR MU MA MZ NA NE NG RW ST SN SC SL SO ZA SS SD TZ TG TN UG ZM ZW",
);
const EMEA = new Set([...EUROPE, ...MIDDLE_EAST, ...AFRICA]);
const REGION_COUNTRIES: Record<WorkRegion, ReadonlySet<string>> = {
  EU,
  Europe: EUROPE,
  EMEA,
  AMER,
  LATAM,
  APAC,
};

const countryInAnyRegion = (country: string, regions: WorkRegion[]): boolean =>
  regions.some(region => REGION_COUNTRIES[region].has(country.toUpperCase()));

const NUMBER_WORDS: Record<string, number> = {
  zero: 0,
  one: 1,
  once: 1,
  two: 2,
  twice: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
};

const parseCount = (value: string): number | null => {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  return NUMBER_WORDS[value.toLowerCase()] ?? null;
};

const monthlyCadence = (raw: string): number | null => {
  const value = raw.trim().toLowerCase();
  if (!value) return null;
  if (
    /\b(?:no|zero)\s+(?:travel|office|on[ -]?site)|\bremote only\b/.test(value)
  ) {
    return 0;
  }

  const explicit = explicitMonthlyCadence(value);
  if (explicit) {
    const count = parseCount(explicit.count);
    if (count === null) return null;
    if (explicit.period === "week") return (count * 52) / 12;
    if (explicit.period === "quarter") return count / 3;
    return count;
  }

  if (/\b(?:every\s+)?week(?:ly)?\b/.test(value)) return 52 / 12;
  if (/\b(?:every\s+)?month(?:ly)?\b/.test(value)) return 1;
  if (/\b(?:every\s+)?quarter(?:ly)?\b/.test(value)) return 1 / 3;
  return null;
};

function explicitMonthlyCadence(
  value: string,
): { count: string; period: string } | null {
  const counts = /\b(\d+|zero|one|once|two|twice|three|four|five|six|seven)/g;
  const number = /\d+(?:\.\d+)?/y;
  const period =
    /\s*(?:(?:days?|times?)\s*)?(?:per|a|each)\s*(week|month|quarter)\b/y;
  for (const count of value.matchAll(counts)) {
    let countValue = count[1];
    if (/^\d/.test(countValue)) {
      number.lastIndex = count.index;
      countValue = number.exec(value)![0];
    }
    period.lastIndex = count.index + countValue.length;
    const matched = period.exec(value);
    if (matched) return { count: countValue, period: matched[1] };
  }
  return null;
}

const attendanceIsOptional = (raw: string): boolean => {
  const optional = /(?:\s+attendance|\s+work)?\s+(?:is\s+)?optional\b/iy;
  for (const place of raw.matchAll(
    /\b(?:office|on[ -]?site|in[ -]?office)/gi,
  )) {
    optional.lastIndex = place.index + place[0].length;
    if (optional.test(raw)) return true;
  }
  return /\b(?:option(?:al)?|may|can|if you (?:choose|prefer))\b[^.;\n]{0,80}\b(?:office|on[ -]?site|in[ -]?office)\b/i.test(
    raw,
  );
};
const disallowsRequiredAttendance = (preference: string | null): boolean =>
  preference !== null &&
  /^(?:remote[_ -]?only|no[_ -]?required[_ -]?attendance)$/i.test(preference);

export type JobForMeGroup =
  "confirmedMatches" | "timezoneNearMisses" | "needsChecking";

export interface CategorizedJobForMe<TJob extends object> {
  group: JobForMeGroup;
  item: JobForMe<TJob>;
}

const groupRank: Record<JobForMeGroup, number> = {
  confirmedMatches: 3,
  timezoneNearMisses: 2,
  needsChecking: 1,
};

interface LocationEvaluation {
  reasons: string[];
  needsChecking: JobForMe<object>["needsChecking"];
  optionalSignals: string[];
  timezoneNearMiss: boolean;
}

function evaluateResidence(
  option: WorkLocationOption,
  preferences: JobPreferences,
  state: LocationEvaluation,
): boolean {
  const { needsChecking } = state;
  const hasCountryExclusions = option.excludedCountries.length > 0;
  const hasRegionExclusions = option.excludedRegions.length > 0;
  if (
    preferences.residenceCountry &&
    includesInsensitive(option.excludedCountries, preferences.residenceCountry)
  ) {
    return false;
  }
  if (hasCountryExclusions && !preferences.residenceCountry) {
    needsChecking.push({
      code: "add_country_for_exclusions",
      message:
        "Add your country to check whether the employer excludes your location.",
    });
  }
  if (
    preferences.residenceCountry &&
    countryInAnyRegion(preferences.residenceCountry, option.excludedRegions)
  ) {
    return false;
  }
  if (hasRegionExclusions && !preferences.residenceCountry) {
    needsChecking.push({
      code: "add_country_for_exclusions",
      message:
        "Add your country to check whether the employer excludes your region.",
    });
  }

  return evaluateIncludedLocations(option, preferences, state);
}

function evaluateIncludedLocations(
  option: WorkLocationOption,
  preferences: JobPreferences,
  state: LocationEvaluation,
): boolean {
  const { reasons, needsChecking } = state;
  const hasCountryRestrictions = option.includedCountries.length > 0;
  const hasRegionRestrictions = option.includedRegions.length > 0;
  if (hasCountryRestrictions) {
    if (!preferences.residenceCountry) {
      needsChecking.push({
        code: "add_country_for_eligibility",
        message: "Add your country to confirm location eligibility.",
      });
    } else if (
      !includesInsensitive(
        option.includedCountries,
        preferences.residenceCountry,
      )
    ) {
      return false;
    } else {
      reasons.push(`The employer includes ${preferences.residenceCountry}.`);
    }
  }
  if (hasRegionRestrictions) {
    if (!preferences.residenceCountry) {
      needsChecking.push({
        code: "add_country_for_eligibility",
        message:
          "Add your country to confirm the employer's regional eligibility.",
      });
    } else if (
      !countryInAnyRegion(preferences.residenceCountry, option.includedRegions)
    ) {
      return false;
    } else {
      reasons.push("Your country is in an included employer region.");
    }
  }
  return true;
}

function evaluateGeographicScope(
  option: WorkLocationOption,
  state: LocationEvaluation,
): void {
  const { reasons, needsChecking } = state;
  const hasCountryExclusions = option.excludedCountries.length > 0;
  const hasRegionExclusions = option.excludedRegions.length > 0;
  const hasCountryRestrictions = option.includedCountries.length > 0;
  const hasRegionRestrictions = option.includedRegions.length > 0;
  if (option.scope === "global") {
    reasons.push(
      hasCountryExclusions || hasRegionExclusions
        ? "The employer says this option is open worldwide outside its listed exclusions."
        : "The employer says this option is open worldwide.",
    );
  } else if (option.scope === "unstated") {
    needsChecking.push({
      code: "geographic_scope_unstated",
      message: "The employer has not stated the geographic scope.",
    });
  } else if (
    (option.scope === "country_list" && !hasCountryRestrictions) ||
    (option.scope === "region" && !hasRegionRestrictions)
  ) {
    needsChecking.push({
      code: "location_eligibility_incomplete",
      message: "The employer's location eligibility list is incomplete.",
    });
  }
}

function evaluateRequiredUtcBand(
  option: WorkLocationOption,
  preferences: JobPreferences,
  state: LocationEvaluation,
): boolean {
  const { reasons, needsChecking } = state;
  if (!option.requiredUtcBand) return true;
  if (preferences.utcOffset === null) {
    needsChecking.push({
      code: "add_utc_offset",
      message: "Add your UTC offset to check collaboration hours.",
    });
    return true;
  }
  const below = option.requiredUtcBand.minimumUtcOffset - preferences.utcOffset;
  const above = preferences.utcOffset - option.requiredUtcBand.maximumUtcOffset;
  const distance = Math.max(below, above, 0);
  if (distance === 0) {
    reasons.push("Your UTC offset is within the employer's stated band.");
    return true;
  }
  if (distance > 1) return false;
  state.timezoneNearMiss = true;
  reasons.push(
    "Your UTC offset is no more than one hour outside the required band.",
  );
  return true;
}

function evaluateUtcBands(
  option: WorkLocationOption,
  preferences: JobPreferences,
  state: LocationEvaluation,
): boolean {
  if (!evaluateRequiredUtcBand(option, preferences, state)) return false;
  const { optionalSignals } = state;
  if (option.preferredUtcBand && preferences.utcOffset !== null) {
    const insidePreferred =
      preferences.utcOffset >= option.preferredUtcBand.minimumUtcOffset &&
      preferences.utcOffset <= option.preferredUtcBand.maximumUtcOffset;
    if (!insidePreferred) {
      optionalSignals.push(
        "Your UTC offset is outside the employer's preferred (not required) band.",
      );
    }
  }
  return true;
}

function evaluateLegalRequirements(
  option: WorkLocationOption,
  state: LocationEvaluation,
): void {
  const { needsChecking } = state;
  // Free-text legal requirements remain unresolved unless a canonical
  // compatibility decision has been persisted upstream.
  if (option.workAuthorizationRequirements.length) {
    needsChecking.push({
      code: "work_authorization_review",
      message:
        "The employer's work authorization requirement needs a manual check.",
    });
  }
  if (option.residencyRequirements.length) {
    needsChecking.push({
      code: "residency_review",
      message: "The employer's residency requirement needs a manual check.",
    });
  }
}

function evaluateRequiredAttendance(
  attendanceCadence: string,
  preferences: JobPreferences,
  state: LocationEvaluation,
): boolean {
  const { reasons, needsChecking } = state;
  if (disallowsRequiredAttendance(preferences.attendancePreference)) {
    return false;
  }
  const requiredCadence = monthlyCadence(attendanceCadence);
  const acceptedCadence = preferences.travelTolerance
    ? monthlyCadence(preferences.travelTolerance)
    : null;
  if (requiredCadence !== null && acceptedCadence !== null) {
    if (requiredCadence > acceptedCadence) return false;
    reasons.push(
      "The required office attendance is within your saved travel tolerance.",
    );
  } else {
    needsChecking.push({
      code: preferences.attendancePreference
        ? "travel_tolerance_review"
        : "attendance_review",
      message: preferences.attendancePreference
        ? "The required office attendance and your travel tolerance need a manual check."
        : "Set an attendance preference to check required office attendance.",
    });
  }
  return true;
}

function evaluateAttendance(
  option: WorkLocationOption,
  preferences: JobPreferences,
  state: LocationEvaluation,
): boolean {
  const attendanceCadence = option.attendanceCadence?.trim() ?? "";
  if (!attendanceCadence) return true;
  if (!attendanceIsOptional(attendanceCadence))
    return evaluateRequiredAttendance(attendanceCadence, preferences, state);
  state.reasons.push("The employer says office attendance is optional.");
  return true;
}

function evaluateOfficeLocation(
  option: WorkLocationOption,
  preferences: JobPreferences,
  state: LocationEvaluation,
): boolean {
  const { reasons, needsChecking } = state;
  if (option.mode === "hybrid" || option.mode === "onsite") {
    if (disallowsRequiredAttendance(preferences.attendancePreference))
      return false;
    if (
      option.officeCity &&
      preferences.residenceCountry &&
      option.includedCountries.length === 1 &&
      includesInsensitive(
        option.includedCountries,
        preferences.residenceCountry,
      )
    ) {
      reasons.push("The office option is in your selected country.");
    } else
      needsChecking.push(
        option.officeCity
          ? {
              code: "office_location_review",
              message:
                "The office location needs a manual check against your residence and travel tolerance.",
            }
          : {
              code: "office_location_missing",
              message:
                "The employer has not provided enough office location detail.",
            },
      );
  }
  return true;
}

function evaluateSponsorship(
  option: WorkLocationOption,
  preferences: JobPreferences,
  state: LocationEvaluation,
): boolean {
  const { needsChecking } = state;
  if (
    preferences.requiresSponsorship === true &&
    option.sponsorshipStatus === "unavailable"
  ) {
    return false;
  }
  if (
    preferences.requiresSponsorship === true &&
    option.sponsorshipStatus === "unstated"
  ) {
    needsChecking.push({
      code: "sponsorship_unstated",
      message: "The employer has not stated whether sponsorship is available.",
    });
  }
  if (preferences.requiresSponsorship === null) {
    needsChecking.push({
      code: "set_sponsorship_preference",
      message: "Set your sponsorship preference to confirm legal eligibility.",
    });
  }
  return true;
}

function matchLocationOption<TJob extends object>(
  job: TJob,
  option: WorkLocationOption,
  preferences: JobPreferences,
): CategorizedJobForMe<TJob> | null {
  if (!preferences.workModes.includes(option.mode)) return null;
  if (
    option.mode === "remote" &&
    (!["verified_remote", "conflicting"].includes(option.classification) ||
      option.confidence === "inherited")
  ) {
    return null;
  }

  const state: LocationEvaluation = {
    reasons: [],
    needsChecking: [],
    optionalSignals: [],
    timezoneNearMiss: false,
  };
  const { reasons, needsChecking, optionalSignals } = state;
  if (option.classification === "conflicting") {
    needsChecking.push({
      code: "conflicting_work_arrangement",
      message:
        "The employer's work-arrangement requirements conflict and need checking.",
    });
  }
  if (!evaluateResidence(option, preferences, state)) return null;
  evaluateGeographicScope(option, state);
  if (!evaluateUtcBands(option, preferences, state)) return null;
  evaluateLegalRequirements(option, state);
  if (!evaluateAttendance(option, preferences, state)) return null;
  if (!evaluateOfficeLocation(option, preferences, state)) return null;
  if (!evaluateSponsorship(option, preferences, state)) return null;

  reasons.unshift(`The ${option.mode} option matches a work mode you accept.`);
  let group: JobForMeGroup = "confirmedMatches";
  if (state.timezoneNearMiss) group = "timezoneNearMisses";
  if (needsChecking.length) group = "needsChecking";
  return {
    group,
    item: {
      job,
      option,
      explanation: reasons.join(" "),
      needsChecking,
      optionalSignals,
    },
  };
}

/**
 * Evaluates every separate WorkArrangementV1 option and returns the strongest
 * truthful result. A confirmed alternative always outranks an unresolved one.
 */
export const matchWorkLocationOptions = <TJob extends object>(
  job: TJob,
  options: WorkLocationOption[],
  preferences: JobPreferences,
  arrangementClassification: WorkArrangementClassification = "unstated",
): CategorizedJobForMe<TJob> | null => {
  if (options.length === 0) {
    if (arrangementClassification === "remote_unqualified") {
      return {
        group: "needsChecking",
        item: {
          job,
          option: null,
          explanation:
            "A source labels this role Remote, but the employer's actual arrangement is not established.",
          needsChecking: [
            {
              code: "remote_evidence_unqualified",
              message:
                "Remote eligibility comes only from an inherited source label.",
            },
          ],
          optionalSignals: [],
        },
      };
    }
    return {
      group: "needsChecking",
      item: {
        job,
        option: null,
        explanation:
          "The employer has not stated a current work arrangement or location eligibility.",
        needsChecking: [
          {
            code: "work_arrangement_unstated",
            message:
              "No current employer-authored work arrangement is available.",
          },
        ],
        optionalSignals: [],
      },
    };
  }
  let best: CategorizedJobForMe<TJob> | null = null;

  for (const option of options) {
    const candidate = matchLocationOption(job, option, preferences);
    if (!candidate) continue;
    if (!best || groupRank[candidate.group] > groupRank[best.group])
      best = candidate;
    if (best.group === "confirmedMatches") break;
  }

  return best;
};

/** Unknown eligibility belongs in the checking view, not a personalized recommendation. */
export const meetsRecommendationConstraints = (
  match: CategorizedJobForMe<object> | null,
): boolean =>
  !!match &&
  match.group !== "timezoneNearMisses" &&
  !match.item.needsChecking.some(
    ({ code }) =>
      ![
        "set_sponsorship_preference",
        "sponsorship_unstated",
        "work_authorization_review",
      ].includes(code),
  );
