import { FactoryProvider, ModuleMetadata } from "@nestjs/common";

export interface PostgresOptions {
  url: string;
  maxConnections: number;
  statementTimeoutMs: number;
  applicationName: string;
}

export interface PostgresAsyncOptions
  extends Pick<ModuleMetadata, "imports">,
    Pick<FactoryProvider<PostgresOptions>, "inject" | "useFactory"> {}
