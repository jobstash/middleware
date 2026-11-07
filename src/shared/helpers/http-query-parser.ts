import { BadRequestException } from "@nestjs/common";
import { parse, ParsedQs } from "qs";

/** Preserve extended query syntax without overflow objects or silent truncation. */
export function parseHttpQuery(query: string | null | undefined): ParsedQs {
  // Express passes `null` when the URL has no query string at all.
  if (!query) return {};
  try {
    const parameters = query.split("&", 4098);
    if (parameters.length > 4096) {
      throw new BadRequestException("Query parameter limit exceeded");
    }
    for (const parameter of parameters) {
      const separator = parameter.indexOf("=");
      const encodedKey =
        separator < 0 ? parameter : parameter.slice(0, separator);
      const key = decodeURIComponent(encodedKey.replaceAll("+", " "));
      if (
        key
          .split(/[[\]]/u)
          .some(
            part =>
              part === "prototype" || Object.hasOwn(Object.prototype, part),
          )
      ) {
        throw new BadRequestException(
          "Prototype-shaped query keys are not allowed",
        );
      }
    }
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
    if (error instanceof URIError) {
      throw new BadRequestException("Malformed query parameter name");
    }
    throw error;
  }
}
