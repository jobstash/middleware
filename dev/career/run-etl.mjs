import { readFile, mkdir, copyFile, chmod } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { spawn } from "node:child_process";
import dotenv from "dotenv";
const etl = new URL("../../../etl/", import.meta.url);
const local = new URL("./.local/", import.meta.url);
const base = dotenv.parse(await readFile(new URL(".env", etl)));
const database = dotenv.parse(await readFile(new URL("database.env", local)));
const middleware = JSON.parse(
  await readFile(new URL("environment.json", local), "utf8"),
);
const url = new URL(database.DATABASE_URL);
if (url.hostname !== "127.0.0.1" || url.port !== "55480")
  throw Error("Local restored database required");
const loginHome = new URL("etl-codex/", local);
await mkdir(loginHome, { recursive: true, mode: 0o700 });
try {
  await readFile(new URL("auth.json", loginHome));
} catch {
  await copyFile(
    homedir() + "/.codex/auth.json",
    new URL("auth.json", loginHome),
  );
}
await chmod(new URL("auth.json", loginHome), 0o600);
const env = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  TMPDIR: process.env.TMPDIR,
  ...base,
  ...database,
  NODE_ENV: "development",
  APP_ENV: "local",
  INSTANCE_ROLE: "local-api",
  CRON: "false",
  PORT: "8080",
  AUTH0_AUDIENCE: middleware.AUTH0_AUDIENCE,
  INFERENCE_PROVIDER: "codex",
  JOB_IMPORT_INFERENCE: "codex",
  JOB_IMPORT_LLM_CONCURRENCY: "1",
  CODEX_AUTH_MODE: "chatgpt",
  CODEX_HOME: fileURLToPath(loginHome),
  CODEX_DEFAULT_MODEL: "gpt-5.4-mini",
  CODEX_DEFAULT_REASONING_EFFORT: "medium",
  CODEX_MAX_CONCURRENT: "1",
  CODEX_DURABLE_MODEL_ENTITY_RECONCILIATION: "gpt-5.4-mini",
  CODEX_DURABLE_MODEL_STRUCTURED_JOBPOST: "gpt-5.4-mini",
  CODEX_DURABLE_LIVE_INFERENCE_ENABLED: "true",
  CODEX_DURABLE_DESIRED_CONCURRENCY: "1",
  INFERENCE_SELF_CHECK_ON_BOOT: "true",
  CLAUDE_SELF_CHECK_ON_BOOT: "false",
  TS_NODE_PROJECT: fileURLToPath(new URL("tsconfig.json", etl)),
  TS_NODE_TRANSPILE_ONLY: "1",
};
for (const key of Object.keys(env))
  if (/^(INFERENCE_PROVIDER_|CODEX_AUTH_MODE_)/.test(key)) delete env[key];
const child = spawn(
  process.execPath,
  [
    "-r",
    fileURLToPath(new URL("node_modules/ts-node/register/index.js", etl)),
    "-r",
    fileURLToPath(new URL("node_modules/tsconfig-paths/register.js", etl)),
    fileURLToPath(new URL("dev/career-local.ts", etl)),
  ],
  { cwd: fileURLToPath(etl), env, stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("exit", code => process.exit(code ?? 1));
