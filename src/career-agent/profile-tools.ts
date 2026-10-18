import { BadRequestException, ConflictException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ProfileService } from "src/auth/profile/profile.service";
import { UpdateJobPreferencesInput } from "src/auth/profile/dto/update-job-preferences.input";
import { UpdateDevLocationInput } from "src/auth/profile/dto/update-dev-location.input";
import { CareerRepository } from "./career.repository";
import { EntityManager } from "typeorm";
import { CandidateMatchingExtraction, CandidateResumeExtraction, SOURCE_PROFILE_PREFERENCE_FIELDS } from "./candidate-document-codec";
import { SOURCE_PROFILE_PREFERENCE_COLUMNS } from "./candidate-source-location";
const list = {
  type: "array",
  maxItems: 30,
  uniqueItems: true,
  items: { type: "string", maxLength: 160 },
};
export const profileUpdateSchema = {
  type: "object",
  additionalProperties: false,
  required: ["requestId", "revision", "expectedVersion"],
  anyOf: [
    { required: ["preferences"] },
    { required: ["location"] },
    { required: ["available"] },
  ],
  properties: {
    requestId: { type: "string", format: "uuid" },
    revision: { type: "integer", minimum: 0 },
    expectedVersion: { type: "string", pattern: "^[a-f0-9]{32}$" },
    available: { type: "boolean" },
    location: {
      type: "object",
      additionalProperties: false,
      minProperties: 1,
      properties: {
        city: { type: ["string", "null"], maxLength: 160 },
        country: { type: ["string", "null"], maxLength: 160 },
      },
    },
    preferences: {
      type: "object",
      additionalProperties: false,
      minProperties: 1,
      properties: {
        workModes: {
          type: "array",
          minItems: 1,
          maxItems: 3,
          uniqueItems: true,
          items: { enum: ["remote", "hybrid", "onsite"] },
        },
        residenceCountry: { type: ["string", "null"], pattern: "^[A-Z]{2}$" },
        utcOffset: {
          type: ["number", "null"],
          minimum: -12,
          maximum: 14,
          multipleOf: 0.25,
        },
        workAuthorization: { type: ["string", "null"], maxLength: 1000 },
        requiresSponsorship: { type: ["boolean", "null"] },
        attendancePreference: {
          enum: [
            "remote_only",
            "remote_preferred",
            "hybrid_ok",
            "onsite_ok",
            "unstated",
            null,
          ],
        },
        travelTolerance: { type: ["string", "null"], maxLength: 1000 },
        searchStatus: { type: ["string", "null"], maxLength: 80 },
        ...Object.fromEntries(
          [
            "rolePriorities",
            "targetOrganizations",
            "languages",
            "jobCategories",
            "seniorityLevels",
            "industries",
            "preferredSkills",
            "fundingStages",
            "paymentCurrencies",
            "commitments",
          ].map(k => [k, list]),
        ),
        minimumSalary: {
          type: ["number", "null"],
          minimum: 0,
          maximum: 100000000,
        },
        salaryCurrency: { type: ["string", "null"], pattern: "^[A-Z]{3}$" },
        companySizeMin: {
          type: ["integer", "null"],
          minimum: 0,
          maximum: 1000000,
        },
        companySizeMax: {
          type: ["integer", "null"],
          minimum: 0,
          maximum: 1000000,
        },
      },
    },
  },
};
export async function profileEditVersion(
  db: { query: (sql: string, parameters?: unknown[]) => Promise<any> },
  wallet: string,
): Promise<string> {
  const [row] = await db.query(
    `SELECT md5(jsonb_build_array(u.properties->'available',p,COALESCE((SELECT jsonb_agg(jsonb_build_array(n.id,n.properties,n.updated_at) ORDER BY n.id) FROM graph_relationships r JOIN graph_nodes n ON n.id=r.target_id WHERE r.source_id=u.id AND r.type='HAS_LOCATION'),'[]'::jsonb))::text) AS version FROM graph_nodes u LEFT JOIN user_job_preferences p ON p.user_node_id=u.id WHERE u.label='User' AND lower(u.properties->>'wallet')=lower($1)`,
    [wallet],
  );
  if (!row) throw new BadRequestException("Profile not found");
  return row.version;
}
export async function updateProfileFromConversation(
  career: CareerRepository,
  profiles: ProfileService,
  wallet: string,
  input: {
    requestId: string;
    revision: number;
    expectedVersion: string;
    preferences?: Record<string, unknown>;
    location?: UpdateDevLocationInput;
    available?: boolean;
  },
) {
  return career.mutate(wallet, "profile_update", input, async (db, owner) => {
    await db.query(
      "INSERT INTO candidate_career_profiles(user_node_id) VALUES($1) ON CONFLICT DO NOTHING",
      [owner],
    );
    const [careerState] = await db.query(
      "SELECT revision FROM candidate_career_profiles WHERE user_node_id=$1",
      [owner],
    );
    if (careerState.revision !== input.revision)
      throw new ConflictException(
        "Career profile changed. Read career_read again before editing.",
      );
    if ((await profileEditVersion(db, wallet)) !== input.expectedVersion)
      throw new ConflictException(
        "Profile changed. Read career_read again before editing.",
      );
    // Reuse the same validated domain service operations as the existing profile API.
    if (input.preferences) {
      const current = await profiles.getJobPreferences(wallet);
      const dto = plainToInstance(UpdateJobPreferencesInput, {
        workModes: current?.workModes ?? ["remote", "hybrid", "onsite"],
        ...input.preferences,
      });
      if (
        (await validate(dto, { whitelist: true, forbidNonWhitelisted: true }))
          .length
      )
        throw new BadRequestException("Invalid preferences");
      if (!(await profiles.updateJobPreferences(wallet, dto, db)))
        throw new BadRequestException("Preferences were not saved");
    }
    if (input.location) {
      const result = await profiles.updateUserLocationInfo(
        wallet,
        input.location,
        db,
      );
      if (!result.success)
        throw new BadRequestException("Location was not saved");
    }
    if (input.available !== undefined) {
      const result = await profiles.updateUserAvailability(
        wallet,
        input.available,
        db,
      );
      if (!result.success)
        throw new BadRequestException("Availability was not saved");
    }
    await db.query(
      "UPDATE candidate_career_profiles SET revision=revision+1 WHERE user_node_id=$1",
      [owner],
    );
    const version = await profileEditVersion(db, wallet);
    const result = {
      id: owner,
      revision: input.revision + 1,
      version,
      updatedFields: Object.keys(input).filter(k =>
        ["preferences", "location", "available"].includes(k),
      ),
      explicitFields: Object.keys(input.preferences ?? {}),
      href: "/settings",
    };
    return result;
  });
}

/** Called under the same owner lock as manual profile edits. Only explicit,
 * source-grounded facts may fill absent values; null decisions remain absent. */
export async function applySourceProfileFacts(
  db: EntityManager, profiles: ProfileService, wallet: string, owner: string,
  facts: CandidateMatchingExtraction | CandidateResumeExtraction,
): Promise<{ appliedFields: string[]; preservedFields: string[] }> {
  const [state] = await db.query(
    `SELECT u.properties->'explicitProfileFields' AS explicit,p.*,
       (SELECT n.properties FROM graph_relationships r JOIN graph_nodes n ON n.id=r.target_id
        WHERE r.source_id=u.id AND r.type='HAS_LOCATION' AND n.label='UserLocation' ORDER BY n.id LIMIT 1) AS location
     FROM graph_nodes u LEFT JOIN user_job_preferences p ON p.user_node_id=u.id WHERE u.id=$1`,
    [owner],
  );
  const appliedFields: string[] = [], preservedFields: string[] = [];
  const preferences: Record<string, unknown> = {};
  const explicit = state.explicit ?? {};
  const locationOverride = Object.prototype.hasOwnProperty.call(state.screening_location_preferences ?? {}, "currentLocation");
  const residence = facts.preferences.residenceCountry ?? facts.location?.countryCode;
  const savedLocation = state.location as Record<string, unknown> | null;
  // A partial/cleared canonical address is still a manual decision. Never create
  // a hybrid address by combining it with a different CV.
  const hasLocation = !!savedLocation && ["city", "country", "countryCode"].some(key => Object.prototype.hasOwnProperty.call(savedLocation, key));
  const residenceBlocked = locationOverride || hasLocation &&
    (!residence || savedLocation?.countryCode !== residence &&
      (!facts.location?.country || savedLocation?.country !== facts.location.country));
  const fill = (field: string, column: string, value: unknown, blocked = false) => {
    if (value == null || Array.isArray(value) && !value.length) return;
    const current = state[column];
    const defaultModes = field === "workModes" && Array.isArray(current) &&
      current.length === 3 && ["remote", "hybrid", "onsite"].every(mode => current.includes(mode));
    const present = current != null && !(Array.isArray(current) && !current.length) && !defaultModes;
    const identical = Array.isArray(current) && Array.isArray(value) &&
      current.length === value.length && current.every(item => value.includes(item));
    if (present || identical || explicit[field] || blocked)
      preservedFields.push(field);
    else { preferences[field] = value; appliedFields.push(field); }
  };
  fill("residenceCountry", "residence_country", residence, residenceBlocked);
  fill("workAuthorization", "work_authorization", facts.preferences.workAuthorization);
  fill("requiresSponsorship", "requires_sponsorship", facts.preferences.requiresSponsorship);
  if ("profileGrounding" in facts && facts.profileGrounding) {
    for (const field of SOURCE_PROFILE_PREFERENCE_FIELDS) {
      if (!facts.profileGrounding[field]) continue;
      const column = SOURCE_PROFILE_PREFERENCE_COLUMNS[field];
      // Paired values cannot be combined with conflicting saved units or bounds.
      const blocked = field === "minimumSalary" || field === "salaryCurrency"
        ? (explicit.minimumSalary && state.minimum_salary == null) ||
          (explicit.salaryCurrency && state.salary_currency == null) ||
          (state.salary_currency != null && state.salary_currency !== facts.preferences.salaryCurrency) ||
          (state.minimum_salary != null && Number(state.minimum_salary) !== facts.preferences.minimumSalary)
        : field === "companySizeMin"
          ? state.company_size_max != null && Number(facts.preferences[field]) > state.company_size_max
          : field === "companySizeMax"
            ? state.company_size_min != null && Number(facts.preferences[field]) < state.company_size_min
            : false;
      fill(field, column, facts.preferences[field], blocked);
    }
  }
  if (Object.keys(preferences).length) {
    const dto = plainToInstance(UpdateJobPreferencesInput, { workModes: ["remote", "hybrid", "onsite"], ...preferences });
    // Do not pass the DTO's required workModes default into the actual partial write.
    if ((await validate(dto, { whitelist: true, forbidNonWhitelisted: true })).length)
      throw new BadRequestException("Invalid source profile facts");
    if (!await profiles.updateJobPreferences(wallet, preferences as unknown as UpdateJobPreferencesInput, db, true))
      throw new BadRequestException("Source profile facts were not saved");
  }
  if (facts.location && (facts.location.city || facts.location.country)) {
    if (hasLocation || locationOverride || explicit.residenceCountry && state.residence_country == null ||
        state.residence_country != null && state.residence_country !== residence) {
      preservedFields.push("location");
    } else {
      const location = Object.fromEntries(Object.entries(facts.location).filter(([, value]) => value != null));
      if (!(await profiles.updateUserLocationInfo(wallet, { city: facts.location.city, country: facts.location.country, ...location }, db)).success)
        throw new BadRequestException("Source location was not saved");
      appliedFields.push("location");
    }
  }
  if (appliedFields.length) {
    await db.query(`INSERT INTO candidate_career_profiles(user_node_id,revision) VALUES($1,1)
      ON CONFLICT(user_node_id) DO UPDATE SET revision=candidate_career_profiles.revision+1,updated_at=now()`, [owner]);
  }
  return { appliedFields, preservedFields };
}
