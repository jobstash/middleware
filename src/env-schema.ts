import * as Joi from "joi";

const envSchema = Joi.object({
  ALLOWED_ORIGINS: Joi.string(),
  APP_PORT: Joi.number().default(8080),
  AUTH0_CLIENT_ID: Joi.string(),
  AUTH0_CLIENT_SECRET: Joi.string(),
  AUTH0_DOMAIN: Joi.string(),
  BACKEND_API_URL: Joi.string(),
  GITHUB_OAUTH_CALLBACK_URL: Joi.string(),
  GITHUB_OAUTH_CLIENT_ID: Joi.string(),
  GITHUB_OAUTH_CLIENT_SECRET: Joi.string(),
  HASH_ROUNDS: Joi.number().default(10),
  JWT_EXPIRES_IN: Joi.string().alphanum(),
  JWT_SECRET: Joi.string().alphanum(),
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
  NODE_ENV: Joi.string()
    .valid("development", "production", "test", "staging")
    .default("development"),
  SENTRY_DSN: Joi.string(),
  SENTRY_TRACES_SAMPLE_RATE: Joi.number(),
});

export default envSchema;