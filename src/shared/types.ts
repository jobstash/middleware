import { Neo4jSupportedTypes } from "neogma";

export * from "./entities";
export * from "./interfaces";
export * from "./enums";

export type ExtractProps<I extends object> = {
  [prop in keyof I]: I[prop] extends Neo4jSupportedTypes ? I[prop] : never;
};

export type JSONSchema<T> = {
  [index in keyof T]: Revalidator.ISchema<T> | Revalidator.JSONSchema<T>;
};

export type NoRelations = object;
