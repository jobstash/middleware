// Explicit local acceptance harness. Never imported by src/main.ts.
import "reflect-metadata";
import { Test } from "@nestjs/testing";
import { ValidationPipe } from "@nestjs/common";
import { NestExpressApplication } from "@nestjs/platform-express";
import { readFileSync } from "node:fs";
import { AppModule } from "../../src/app.module";
import { PrivyService } from "../../src/auth/privy/privy.service";
import { MailService } from "../../src/mail/mail.service";
import { AgentService } from "../../src/career-agent/agent.service";
import { AuthService } from "../../src/auth/auth.service";
import { CareerRepository } from "../../src/career-agent/career.repository";
import { PostgresService } from "../../src/postgres/postgres.service";
import type { Response } from "express";
import { installScreeningEvalRoutes } from "./screening-eval-routes";

const database = new URL(process.env.DATABASE_URL!);
if (process.env.NODE_ENV !== "development" || process.env.LOCAL_ONLY !== "true" || process.env.LOCAL_BACKEND_FIXTURES !== "true" ||
    database.hostname !== "127.0.0.1" || database.port !== "55480" || database.pathname !== "/recruiters_rip_local")
  throw Error("Dedicated local recruiters fixtures required");
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  const clickhouse = process.env.CAREER_CLICKHOUSE_URL;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && (!clickhouse || url.origin !== new URL(clickhouse).origin))
    throw new Error("External runtime destination is not allowed by the local network policy");
  // Never let an allowed endpoint redirect around the destination policy.
  return realFetch(input, { ...init, redirect: "error" });
};


async function main() {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MailService).useValue(new Proxy({}, { get: (_target, key) => key === "then" ? undefined : async () => ({ success: true, message: "Local fixture: no email sent" }) }))
    .overrideProvider(PrivyService).useValue({
      getUserById: async (id: string) => {
        const fixtures = JSON.parse(readFileSync(process.env.LOCAL_AUTH_FIXTURES!, "utf8")).accounts;
        if (!fixtures.some((entry: { privyDid: string }) => entry.privyDid === id)) throw Error("Local fixture account required");
        return { id, linkedAccounts: [] };
      },
    }).compile();
  const agent = module.get(AgentService);
  const app = module.createNestApplication<NestExpressApplication>({rawBody:true});
  app.useBodyParser("json",{limit:"12mb"});
  app.useGlobalPipes(new ValidationPipe());
  app.useLogger(["error", "warn"]);
  app.getHttpAdapter().get("/health/local-fixtures", (_req: unknown, res: Response) =>
    res.json({ fixtureMode: true, inferenceMode: "device", serverInference: false }));
  installScreeningEvalRoutes(app, { agent, auth: module.get(AuthService), career: module.get(CareerRepository), db: module.get(PostgresService) });
  await app.listen(8086,"127.0.0.1");
  console.log("Local recruiters middleware: http://127.0.0.1:8086; auth/email simulated; candidate billing disabled; direct-app MCP reads; no platform inference execution.");
  for(const signal of ["SIGINT","SIGTERM"] as const)process.once(signal,()=>{void app.close().then(()=>process.exit(0));});
}
void main();
