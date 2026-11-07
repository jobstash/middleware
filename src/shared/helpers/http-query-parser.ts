import { BadRequestException } from "@nestjs/common";
import { parse, ParsedQs } from "qs";

/** Preserve extended query syntax without overflow objects or silent truncation. */
export function parseHttpQuery(query: string): ParsedQs {
  try {
    return parse(query, {
      allowPrototypes: false,
      arrayLimit: 100,
      parameterLimit: 4096,
      throwOnLimitExceeded: true,
    });
  } catch (error) {
    if (error instanceof RangeError) {
      throw new BadRequestException("Query parameter or array limit exceeded");
    }
    throw error;
  }
}
