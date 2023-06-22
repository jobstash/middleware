import { ApiProperty } from "@nestjs/swagger";
import { StructuredJobpost } from "./structured-jobpost.interface";
import * as t from "io-ts";
import { isLeft } from "fp-ts/lib/Either";
import { report } from "io-ts-human-reporter";

export class StructuredJobpostWithCategory extends StructuredJobpost {
  public static readonly StructuredJobpostWithCategoryType = t.intersection([
    StructuredJobpost.StructuredJobpostType,
    t.strict({
      category: t.strict({
        id: t.string,
        name: t.string,
      }),
    }),
  ]);

  @ApiProperty()
  category: { id: string; name: string };

  constructor(raw: StructuredJobpostWithCategory) {
    const { category, ...jobProps } = raw;
    super(jobProps);
    const result =
      StructuredJobpostWithCategory.StructuredJobpostWithCategoryType.decode(
        raw,
      );
    this.category = category;
    if (isLeft(result)) {
      report(result).forEach(x => {
        console.error(x);
      });
    }
  }
}
