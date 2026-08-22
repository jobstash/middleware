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

  const explicit = value.match(
    /\b(\d+(?:\.\d+)?|zero|one|once|two|twice|three|four|five|six|seven)\s*(?:days?|times?)?\s*(?:per|a|each)\s*(week|month|quarter)\b/,
  );
  if (explicit) {
    const count = parseCount(explicit[1]);
    if (count === null) return null;
    if (explicit[2] === "week") return (count * 52) / 12;
    if (explicit[2] === "quarter") return count / 3;
    return count;
  }

  if (/\b(?:every\s+)?week(?:ly)?\b/.test(value)) return 52 / 12;
  if (/\b(?:every\s+)?month(?:ly)?\b/.test(value)) return 1;
  if (/\b(?:every\s+)?quarter(?:ly)?\b/.test(value)) return 1 / 3;
  return null;
};

const attendanceIsOptional = (raw: string): boolean =>
  /\b(?:office|on[ -]?site|in[ -]?office)(?:\s+attendance|\s+work)?\s+(?:is\s+)?optional\b/i.test(
    raw,
  ) ||
  /\b(?:option(?:al)?|may|can|if you (?:choose|prefer))\b[^.;\n]{0,80}\b(?:office|on[ -]?site|in[ -]?office)\b/i.test(
    raw,
  );

const disallowsRequiredAttendance = (preference: string | null): boolean =>
  preference !== null &&
  /^(?:remote[_ -]?only|no[_ -]?required[_ -]?attendance)$/i.test(preference);

export type JobForMeGroup =
  | "confirmedMatches"
  | "timezoneNearMisses"
  | "needsChecking";

export interface CategorizedJobForMe<TJob extends object> {
  group: JobForMeGroup;
  item: JobForMe<TJob>;
}

const groupRank: Record<JobForMeGroup, number> = {
  confirmedMatches: 3,
  timezoneNearMisses: 2,
  needsChecking: 1,
};

const EMPLOYER_EVIDENCE = new Set([
  "employer_body",
  "employer_ats_field",
  "verified_employer_policy",
]);

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
            "A source labels this role Remote, but no employer-authored evidence verifies that claim.",
          needsChecking: [
            {
              code: "remote_evidence_unqualified",
              message:
                "Remote eligibility is based only on unverified aggregator evidence.",
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
              "No current employer-authored work-arrangement evidence is available.",
          },
        ],
        optionalSignals: [],
      },
    };
  }
  let best: CategorizedJobForMe<TJob> | null = null;

  for (const option of options) {
    if (!preferences.workModes.includes(option.mode)) continue;
    if (
      option.mode === "remote" &&
      (!["verified_remote", "conflicting"].includes(option.classification) ||
        !option.evidence.some(
          evidence =>
            EMPLOYER_EVIDENCE.has(evidence.source) &&
            EMPLOYER_EVIDENCE.has(evidence.trust) &&
            evidence.source === evidence.trust,
        ))
    ) {
      continue;
    }

    const reasons: string[] = [];
    const needsChecking: JobForMe<TJob>["needsChecking"] = [];
    let timezoneNearMiss = false;
    const optionalSignals: string[] = [];
    const hasCountryExclusions = option.excludedCountries.length > 0;
    const hasRegionExclusions = option.excludedRegions.length > 0;
    const hasCountryRestrictions = option.includedCountries.length > 0;
    const hasRegionRestrictions = option.includedRegions.length > 0;

    if (option.classification === "conflicting") {
      needsChecking.push({
        code: "conflicting_work_arrangement",
        message:
          "The employer's work-arrangement evidence conflicts and needs review.",
      });
    }

    if (
      preferences.residenceCountry &&
      includesInsensitive(
        option.excludedCountries,
        preferences.residenceCountry,
      )
    ) {
      continue;
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
      continue;
    }
    if (hasRegionExclusions && !preferences.residenceCountry) {
      needsChecking.push({
        code: "add_country_for_exclusions",
        message:
          "Add your country to check whether the employer excludes your region.",
      });
    }

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
        continue;
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
        !countryInAnyRegion(
          preferences.residenceCountry,
          option.includedRegions,
        )
      ) {
        continue;
      } else {
        reasons.push("Your country is in an included employer region.");
      }
    }

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

    if (option.requiredUtcBand) {
      if (preferences.utcOffset === null) {
        needsChecking.push({
          code: "add_utc_offset",
          message: "Add your UTC offset to check collaboration hours.",
        });
      } else {
        const below =
          option.requiredUtcBand.minimumUtcOffset - preferences.utcOffset;
        const above =
          preferences.utcOffset - option.requiredUtcBand.maximumUtcOffset;
        const distance = Math.max(below, above, 0);
        if (distance === 0) {
          reasons.push("Your UTC offset is within the employer's stated band.");
        } else {
          if (distance > 1) continue;
          timezoneNearMiss = true;
          reasons.push(
            "Your UTC offset is no more than one hour outside the required band.",
          );
        }
      }
    }
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

    const attendanceCadence = option.attendanceCadence?.trim() ?? "";
    const optionalAttendance =
      attendanceCadence.length > 0 && attendanceIsOptional(attendanceCadence);
    const requiredAttendance =
      attendanceCadence.length > 0 && !optionalAttendance;
    if (requiredAttendance) {
      if (disallowsRequiredAttendance(preferences.attendancePreference)) {
        continue;
      }
      const requiredCadence = monthlyCadence(attendanceCadence);
      const acceptedCadence = preferences.travelTolerance
        ? monthlyCadence(preferences.travelTolerance)
        : null;
      if (requiredCadence !== null && acceptedCadence !== null) {
        if (requiredCadence > acceptedCadence) continue;
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
    } else if (optionalAttendance) {
      reasons.push("The employer says office attendance is optional.");
    }
    if (option.mode === "hybrid" || option.mode === "onsite") {
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

    if (
      preferences.requiresSponsorship === true &&
      option.sponsorshipStatus === "unavailable"
    ) {
      continue;
    }
    if (
      preferences.requiresSponsorship === true &&
      option.sponsorshipStatus === "unstated"
    ) {
      needsChecking.push({
        code: "sponsorship_unstated",
        message:
          "The employer has not stated whether sponsorship is available.",
      });
    }
    if (preferences.requiresSponsorship === null) {
      needsChecking.push({
        code: "set_sponsorship_preference",
        message:
          "Set your sponsorship preference to confirm legal eligibility.",
      });
    }

    reasons.unshift(
      `The ${option.mode} option matches a work mode you accept.`,
    );
    const group: JobForMeGroup = needsChecking.length
      ? "needsChecking"
      : timezoneNearMiss
        ? "timezoneNearMisses"
        : "confirmedMatches";
    const candidate: CategorizedJobForMe<TJob> = {
      group,
      item: {
        job,
        option,
        explanation: reasons.join(" "),
        needsChecking,
        optionalSignals,
      },
    };
    if (!best || groupRank[group] > groupRank[best.group]) best = candidate;
    if (best.group === "confirmedMatches") break;
  }

  return best;
};
