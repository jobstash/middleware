import { ApiProperty } from "@nestjs/swagger";
import { StructuredJobpost } from "./structured-jobpost.interface";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";
import { Tag } from "./tag.interface";

export class StructuredJobpostWithRelations extends StructuredJobpost {
  public static readonly StructuredJobpostWithRelationsType = t.intersection([
    StructuredJobpost.StructuredJobpostType,
    t.strict({
      commitment: t.string,
      classification: t.string,
      tags: t.array(t.strict({ name: t.string, normalizedName: t.string })),
      locationType: t.union([t.string, t.null]),
    }),
  ]);

  @ApiProperty()
  tags: Tag[];

  @ApiProperty()
  commitment: string;

  @ApiProperty()
  locationType: string;

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
