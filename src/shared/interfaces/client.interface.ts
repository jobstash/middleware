import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";
import { ATSPreferences } from "./ats-preferences.interface";

const SupportedPlatforms = [
  "lever",
  "workable",
  "greenhouse",
  "jobstash",
] as const;

const Platform = t.keyof({
  ...SupportedPlatforms.reduce((acc, name) => ({ ...acc, [name]: null }), {}),
});

type SupportedPlatform = "lever" | "greenhouse" | "workable" | "jobstash";

export class BaseClient {
  public static readonly BaseClientType = t.strict({
    id: t.string,
    name: Platform,
    hasTags: t.boolean,
    hasWebhooks: t.boolean,
    orgId: t.union([t.string, t.null]),
    preferences: ATSPreferences.ATSPreferencesType,
  });

  id: string;
  orgId: string | null;
  hasTags: boolean;
  hasWebhooks: boolean;
  name: SupportedPlatform;
  preferences: ATSPreferences | null;
  encryptedClientPII?: string | null = undefined;

  constructor(raw: BaseClient) {
    const result = BaseClient.BaseClientType.decode(raw);

    this.id = raw.id;
    this.name = raw.name;
    this.orgId = raw.orgId;
    this.hasTags = raw.hasTags;
    this.hasWebhooks = raw.hasWebhooks;
    this.preferences = raw.preferences
      ? new ATSPreferences(raw.preferences)
      : null;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `base client instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
