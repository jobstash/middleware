import { TransformFnParams } from "class-transformer";

export const btoaList = ({ value }: TransformFnParams): string[] => {
  if (typeof value === "string") {
    return value
      .split(",")
      .map(encodedString =>
        Buffer.from(encodedString, "base64").toString("ascii"),
      );
  }
  return value;
};
