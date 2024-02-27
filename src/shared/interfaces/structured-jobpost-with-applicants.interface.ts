import { ApiProperty } from "@nestjs/swagger";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import { StructuredJobpostWithRelations } from "./structured-jobpost-with-relations.interface";
import { UserProfile } from "./user";

export class StructuredJobpostWithApplicants extends StructuredJobpostWithRelations {
  public static readonly StructuredJobpostWithApplicantsType = t.intersection([
    StructuredJobpostWithRelations.StructuredJobpostWithRelationsType,
    t.strict({
      applicants: t.array(UserProfile.UserProfileType),
    }),
  ]);

  @ApiProperty()
  applicants: UserProfile[];

  constructor(raw: StructuredJobpostWithApplicants) {
    const { applicants, ...jobProps } = raw;
    super(jobProps);
    this.applicants = applicants;

    const result =
      StructuredJobpostWithRelations.StructuredJobpostWithRelationsType.decode(
        raw,
      );

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `structured jobpost with applicants instance with id ${this.shortUUID} failed validation with error '${x}'`,
        );
      });
    }
  }
}
