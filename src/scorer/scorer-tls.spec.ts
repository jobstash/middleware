import "reflect-metadata";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, Agent, Server } from "node:https";
import { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpModule } from "@nestjs/axios";
import { DynamicModule, FactoryProvider, Type } from "@nestjs/common";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import { ProfileModule } from "src/auth/profile/profile.module";
import { introPathsHttp } from "src/companion/intro-paths";
import { JobsModule } from "src/jobs/jobs.module";
import { PeopleIntelligenceModule } from "src/people-intelligence/people-intelligence.module";
import { TeamIntelligenceModule } from "src/team-intelligence/team-intelligence.module";
import { UserModule } from "src/user/user.module";
import { ScorerModule } from "./scorer.module";

async function moduleClient(
  moduleType: Type<unknown>,
  config: ConfigService,
): Promise<AxiosInstance> {
  const imports: DynamicModule[] = Reflect.getMetadata(
    MODULE_METADATA.IMPORTS,
    moduleType,
  );
  const http = imports.find(value => value.module === HttpModule);
  const options = http?.providers?.find(
    (provider): provider is FactoryProvider<AxiosRequestConfig> =>
      typeof provider === "object" &&
      "provide" in provider &&
      provider.provide === "HTTP_MODULE_OPTIONS" &&
      "useFactory" in provider,
  );
  if (!options) throw new Error("Scorer HTTP options factory is missing");
  return axios.create(await options.useFactory(config));
}

const clients: Array<
  [string, (config: ConfigService) => AxiosInstance | Promise<AxiosInstance>]
> = [
  [
    "scorer",
    (config): Promise<AxiosInstance> => moduleClient(ScorerModule, config),
  ],
  [
    "profile",
    (config): Promise<AxiosInstance> => moduleClient(ProfileModule, config),
  ],
  [
    "jobs",
    (config): Promise<AxiosInstance> => moduleClient(JobsModule, config),
  ],
  [
    "user",
    (config): Promise<AxiosInstance> => moduleClient(UserModule, config),
  ],
  [
    "people intelligence",
    (config): Promise<AxiosInstance> =>
      moduleClient(PeopleIntelligenceModule, config),
  ],
  [
    "team intelligence",
    (config): Promise<AxiosInstance> =>
      moduleClient(TeamIntelligenceModule, config),
  ],
  ["companion intro paths", introPathsHttp],
];

async function listen(server: Server): Promise<string> {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function close(server: Server | undefined): Promise<void> {
  if (!server) return;
  server.closeAllConnections();
  await promisify(server.close.bind(server))();
}

describe("scorer clients verify TLS before transmitting credentials", () => {
  let directory: string;
  let trustedCertificate: Buffer;
  let trusted: Server;
  let untrusted: Server;
  let trustedUrl: string;
  let untrustedUrl: string;
  let untrustedRequests = 0;

  beforeAll(async () => {
    // These short-lived fixture authorities and keys never leave the test's
    // temporary directory. No production certificate or credential is used.
    directory = mkdtempSync(join(tmpdir(), "middleware-scorer-tls-"));
    const configPath = join(directory, "fixture.cnf");
    writeFileSync(
      configPath,
      `[req]\nprompt=no\ndistinguished_name=dn\nx509_extensions=extensions\n[dn]\nCN=localhost\n[extensions]\nsubjectAltName=DNS:localhost,IP:127.0.0.1\nbasicConstraints=critical,CA:TRUE\nkeyUsage=critical,digitalSignature,keyEncipherment,keyCertSign\nextendedKeyUsage=serverAuth\n`,
    );
    for (const name of ["trusted", "untrusted"]) {
      execFileSync(
        "openssl",
        [
          "req",
          "-x509",
          "-newkey",
          "rsa:2048",
          "-nodes",
          "-days",
          "2",
          "-config",
          configPath,
          "-keyout",
          join(directory, `${name}.key`),
          "-out",
          join(directory, `${name}.crt`),
        ],
        { stdio: "ignore" },
      );
    }
    trustedCertificate = readFileSync(join(directory, "trusted.crt"));
    trusted = createServer(
      {
        key: readFileSync(join(directory, "trusted.key")),
        cert: trustedCertificate,
      },
      (request, response) => {
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({ authorization: request.headers.authorization }),
        );
      },
    );
    untrusted = createServer(
      {
        key: readFileSync(join(directory, "untrusted.key")),
        cert: readFileSync(join(directory, "untrusted.crt")),
      },
      (_request, response) => {
        untrustedRequests += 1;
        response.end("credential must not reach this server");
      },
    );
    trustedUrl = await listen(trusted);
    untrustedUrl = await listen(untrusted);
  }, 30_000);

  afterAll(async () => {
    await Promise.all([close(trusted), close(untrusted)]);
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it.each(clients)(
    "%s accepts trusted TLS and rejects an untrusted peer",
    async (_name, createClient) => {
      const client = await createClient(
        new ConfigService({
          SCORER_DOMAIN: trustedUrl,
          SCORER_API_KEY: "synthetic-scorer-fixture-key",
        }),
      );
      const agent: Agent = client.defaults.httpsAgent;
      // Trust only this fixture authority. The real factory's verification mode
      // remains unchanged, so rejectUnauthorized:false would fail this test.
      agent.options.ca = trustedCertificate;
      try {
        await expect(
          client.get("/tls-proof", { proxy: false }),
        ).resolves.toMatchObject({
          status: 200,
          data: { authorization: "Bearer synthetic-scorer-fixture-key" },
        });
        await expect(
          client.get(`${untrustedUrl}/tls-proof`, { proxy: false }),
        ).rejects.toMatchObject({
          code: "DEPTH_ZERO_SELF_SIGNED_CERT",
        });
        expect(untrustedRequests).toBe(0);
      } finally {
        agent.destroy();
      }
    },
  );
});
