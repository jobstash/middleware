import { ApiProperty } from "@nestjs/swagger";
import { StructuredJobpost } from "./structured-jobpost.interface";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";

export class StructuredJobpostWithRelations extends StructuredJobpost {
  public static readonly StructuredJobpostWithRelationsType = t.intersection([
    StructuredJobpost.StructuredJobpostType,
    t.strict({
      classification: t.string,
      commitment: t.union([t.string, t.null]),
      tags: t.array(t.strict({ name: t.string, normalizedName: t.string })),
      locationType: t.union([t.string, t.null]),
    }),
  ]);

  @ApiProperty()
  tags: { name: string; normalizedName: string }[];

  @ApiProperty()
  commitment: string | null;

  @ApiProperty()
  locationType: string | null;

  @ApiProperty()
  classification: string;

  constructor(raw: StructuredJobpostWithRelations) {
    const { tags, commitment, locationType, classification, ...jobProps } = raw;
    super(jobProps);
    this.tags = tags;
    this.commitment = commitment;
    this.locationType = locationType;
    this.classification = classification;

    const result =
      StructuredJobpostWithRelations.StructuredJobpostWithRelationsType.decode(
        raw,
      );

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `structured jobpost with relations instance with id ${this.shortUUID} failed validation with error '${x}'`,
        );
      });
    }
  }
}
