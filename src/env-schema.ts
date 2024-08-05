import * as Joi from "joi";

const envSchema = Joi.object({
  ALLOWED_ORIGINS: Joi.string(),
  APP_PORT: Joi.number().default(8080),
  CACHE_VALIDITY_THRESHOLD: Joi.number().default(1),
  DIFF: Joi.string(),
  EMAIL: Joi.string(),
  VCDATA_API_KEY: Joi.string(),
  GITHUB_DEV_OAUTH_CLIENT_ID: Joi.string(),
  GITHUB_DEV_OAUTH_CLIENT_SECRET: Joi.string(),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: Joi.string(),
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: Joi.string(),
  GRANTS_STACK_INDEXER_URL: Joi.string(),
  INFURA_API_KEY: Joi.string(),
  JWT_EXPIRES_IN: Joi.string().alphanum(),
  JWT_SECRET: Joi.string().alphanum(),
  LOCAL_HTTPS: Joi.string().valid("no", "yes").default("no"),
  MAGIC_LINK_EXPIRES_IN: Joi.string(),
  MAGIC_LINK_SECRET: Joi.string(),
  MW_DOMAIN: Joi.string(),
  FE_DOMAIN: Joi.string(),
  NEO4J_HOST: Joi.string(),
  NEO4J_PASSWORD: Joi.string(),
  NEO4J_PORT: Joi.number(),
  NEO4J_SCHEME: Joi.string().valid(
    "bolt",
    "bolt+s",
    "bolt+scc",
    "neo4j",
    "neo4j+s",
    "neo4j+scc",
  ),
  NEO4J_USERNAME: Joi.string(),
  NEO4J_DATABASE: Joi.string(),
  NEO4J_HOST_TEST: Joi.string(),
  NEO4J_PASSWORD_TEST: Joi.string(),
  NEO4J_PORT_TEST: Joi.number(),
  NEO4J_SCHEME_TEST: Joi.string().valid(
    "bolt",
    "bolt+s",
    "bolt+scc",
    "neo4j",
    "neo4j+s",
    "neo4j+scc",
  ),
  NEO4J_USERNAME_TEST: Joi.string(),
  NEO4J_DATABASE_TEST: Joi.string(),
  NFT_STORAGE_API_KEY: Joi.string(),
  NODE_ENV: Joi.string()
    .valid("development", "production", "test", "staging")
    .default("development"),
  SCORER_API_KEY: Joi.string(),
  SCORER_DOMAIN: Joi.string(),
  SENDGRID_API_KEY: Joi.string(),
  SENTRY_DSN: Joi.string(),
  SENTRY_TRACES_SAMPLE_RATE: Joi.number(),
  SESSION_SECRET: Joi.string(),
  SWAGGER_USER: Joi.string(),
  SWAGGER_PASSWORD: Joi.string(),
  SKILL_THRESHOLD: Joi.number(),
  TEST_DB_MANAGER_URL: Joi.string(),
  TEST_DB_MANAGER_API_KEY: Joi.string(),
});

export default envSchema;
