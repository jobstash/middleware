import { ApiProperty } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import { TrackedNFT } from "./tracked-nft.interface";
import * as t from "io-ts";

const SupportedPlatforms = [
  "lever",
  "workable",
  "greenhouse",
  "jobstash",
] as const;

const Platform = t.keyof({
  ...SupportedPlatforms.reduce((acc, name) => ({ ...acc, [name]: null }), {}),
});

export class ATSPreferences {
  public static readonly ATSPreferencesType = t.strict({
    id: t.string,
    platformName: Platform,
    highlightOrgs: t.array(t.string),
    trackedNfts: t.array(TrackedNFT.TrackedNFTType),
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  platformName: "lever" | "workable" | "greenhouse" | "jobstash";

  @ApiProperty()
  highlightOrgs: string[];

  @ApiProperty()
  trackedNfts: TrackedNFT[];

  constructor(raw: ATSPreferences) {
    const { id, platformName, highlightOrgs, trackedNfts } = raw;
    const result = ATSPreferences.ATSPreferencesType.decode(raw);

    this.id = id;
    this.platformName = platformName;
    this.highlightOrgs = highlightOrgs;
    this.trackedNfts = trackedNfts;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `ats preferences instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
