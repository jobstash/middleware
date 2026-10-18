import * as Joi from "joi";

const envSchema = Joi.object({
  LOCAL_ONLY: Joi.string().valid("true", "false").default("false"),
  ALLOWED_ORIGINS: Joi.string(),
  APP_PORT: Joi.number().default(8080),
  ADMIN_EMAIL: Joi.string().required(),
  AUTH0_AUDIENCE: Joi.string().required(),
  AUTH0_DOMAIN: Joi.string().required(),
  USER_CACHE_EXPIRATION_IN_DAYS: Joi.number().required(),
  DIFF: Joi.string(),
  EMAIL: Joi.string().required(),
  EV_DOMAIN: Joi.string().required(),
  ETL_CLIENT_ID: Joi.string().required(),
  ETL_CLIENT_SECRET: Joi.string().required(),
  ETL_DOMAIN: Joi.string().required(),
  FE_DOMAIN: Joi.string().required(),
  GITHUB_INDEXER_STATUS_URL: Joi.string().uri().optional(),
  GITHUB_INDEXER_STATUS_TOKEN: Joi.string().optional(),
  INFURA_API_KEY: Joi.string().required(),
  JOB_PROMOTION_PRICE: Joi.number().required(),
  JWT_EXPIRES_IN: Joi.string().alphanum().required(),
  JWT_SECRET: Joi.string().alphanum().required(),
  MAGIC_LINK_EXPIRES_IN: Joi.string().required(),
  MAGIC_LINK_SECRET: Joi.string().required(),
  MW_DOMAIN: Joi.string().required(),
  DATABASE_URL: Joi.string()
    .uri({ scheme: ["postgres", "postgresql"] })
    .required(),
  DATABASE_TEST_URL: Joi.string()
    .uri({ scheme: ["postgres", "postgresql"] })
    .optional(),
  DATABASE_POOL_SIZE: Joi.number().integer().positive().default(30),
  DATABASE_STATEMENT_TIMEOUT_MS: Joi.number()
    .integer()
    .positive()
    .default(30000),
  NFT_STORAGE_API_KEY: Joi.string(),
  NODE_ENV: Joi.string()
    .valid("development", "production", "test", "staging")
    .default("development"),
  RECRUITERS_DEVICE_ONLY: Joi.string().valid("true", "false").default("false"),
  OPENAI_API_KEY: Joi.when("RECRUITERS_DEVICE_ONLY", {
    is: "true",
    then: Joi.forbidden(),
    otherwise: Joi.string().required(),
  }),
  RECOMMENDATION_EMBEDDING_BATCH_SIZE: Joi.number()
    .integer()
    .min(1)
    .max(1000)
    .default(100),
  RECOMMENDATION_EMBEDDING_CONCURRENCY: Joi.number()
    .integer()
    .min(1)
    .max(5)
    .default(5),
  ORG_ADMIN_DOMAIN: Joi.string().required(),
  PRIVY_APP_ID: Joi.string().required(),
  PRIVY_APP_SECRET: Joi.string().required(),
  PRIVY_WEBHOOK_KEY: Joi.string().required(),
  REPORT_CONTENT_TO_EMAIL: Joi.string().required(),
  SCORER_API_KEY: Joi.string().required(),
  SCORER_DOMAIN: Joi.string().required(),
  SENDGRID_API_KEY: Joi.string().required(),
  SESSION_SECRET: Joi.string().required(),
  SENTRY_DSN: Joi.when("LOCAL_ONLY", { is: "true", then: Joi.string().allow("").optional(), otherwise: Joi.string().required() }),
  SENTRY_TRACES_SAMPLE_RATE: Joi.number().default(1),
  SENTRY_PROFILE_SAMPLE_RATE: Joi.number().default(0.5),
  SKILL_THRESHOLD: Joi.number().required(),
  STRIPE_API_KEY: Joi.string().required(),
  STRIPE_WEBHOOK_SECRET: Joi.string().required(),
  CANDIDATE_STRIPE_SECRET_KEY: Joi.string(),
  CANDIDATE_STRIPE_WEBHOOK_SECRET: Joi.string(),
  CANDIDATE_STRIPE_MONTHLY_PRICE_ID: Joi.string(),
  CANDIDATE_STRIPE_YEARLY_PRICE_ID: Joi.string(),
  SWAGGER_USER: Joi.string().required(),
  SWAGGER_PASSWORD: Joi.string().required(),
  TEST_DB_MANAGER_URL: Joi.string(),
  TEST_DB_MANAGER_API_KEY: Joi.string(),
  MCP_RESOURCE_URL: Joi.string().uri(),
  MCP_ISSUER_URL: Joi.string().uri(),
  MCP_FRONTEND_URL: Joi.string().uri(),
  MCP_USAGE_UNIT: Joi.string().valid("calls", "records").default("calls"),
  MCP_ADVANCED_MONTHLY_LIMIT: Joi.number().integer().min(0),
  CAREER_OPENAI_MODEL: Joi.string().max(200).default("gpt-6-astra"),
  CAREER_ANTHROPIC_MODEL: Joi.string().max(200).default("claude-sonnet-5"),
  RECRUITERS_PUBLIC_ORIGIN: Joi.string().uri(),
  CAREER_DOCUMENT_ID_KEY: Joi.string().min(32),
  CAREER_DOCUMENT_STORAGE: Joi.string().valid("local", "r2"),
  CAREER_DOCUMENT_LOCAL_DIRECTORY: Joi.string(),
  R2_ENDPOINT: Joi.string().uri(),
  R2_ACCESS_KEY_ID: Joi.string(),
  R2_SECRET_ACCESS_KEY: Joi.string(),
  R2_BUCKET_NAME: Joi.string(),
  VCDATA_API_KEY: Joi.string().required(),
});

export default envSchema;
