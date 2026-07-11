import { ModuleMetadata } from "@nestjs/common";

export interface PostgresOptions {
  url: string;
  maxConnections: number;
  statementTimeoutMs: number;
  applicationName: string;
}

export interface PostgresAsyncOptions extends Pick<ModuleMetadata, "imports"> {
  inject?: any[];
  useFactory: (...args: any[]) => Promise<PostgresOptions> | PostgresOptions;
}
