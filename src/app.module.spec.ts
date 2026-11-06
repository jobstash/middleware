import { ConfigService } from "@nestjs/config";
import * as Sentry from "@sentry/node";
import { AppModule } from "./app.module";
import envSchema from "./env-schema";

jest.mock("@nestjs/config", () => {
  const actual = jest.requireActual("@nestjs/config");
  return {
    ...actual,
    ConfigModule: { ...actual.ConfigModule, forRoot: jest.fn(() => ({})) },
  };
});

jest.mock("@sentry/node", () => ({
  ...jest.requireActual("@sentry/node"),
  init: jest.fn(),
}));

describe("Sentry SDK upgrade sampling policy", () => {
  afterEach(() => jest.clearAllMocks());

  it.each([0, 0.2, 0.5, 0.99, 1, 1.5, -0.5, "0", "0.2", "0.5", "1", undefined])(
    "retains the deployed parseInt result for configured value %p",
    configured => {
      const config = new ConfigService({
        SENTRY_DSN: "",
        SENTRY_TRACES_SAMPLE_RATE: configured,
        SENTRY_PROFILE_SAMPLE_RATE: configured,
      });
      new AppModule(config).onModuleInit();
      const expected = Number.parseInt(String(configured ?? "0.2"), 10);
      expect(Sentry.init).toHaveBeenCalledWith(
        expect.objectContaining({
          tracesSampleRate: expected,
          profileSessionSampleRate: expected,
          profileLifecycle: "trace",
          dataCollection: {
            userInfo: true,
            cookies: true,
            genAI: { inputs: false, outputs: false },
          },
        }),
      );
    },
  );

  it("preserves effective schema defaults: traces enabled, profiles disabled", () => {
    const traces = envSchema
      .extract("SENTRY_TRACES_SAMPLE_RATE")
      .validate(undefined);
    const profiles = envSchema
      .extract("SENTRY_PROFILE_SAMPLE_RATE")
      .validate(undefined);
    expect(traces.error).toBeUndefined();
    expect(profiles.error).toBeUndefined();
    new AppModule(
      new ConfigService({
        SENTRY_DSN: "",
        SENTRY_TRACES_SAMPLE_RATE: traces.value,
        SENTRY_PROFILE_SAMPLE_RATE: profiles.value,
      }),
    ).onModuleInit();
    expect(Sentry.init).toHaveBeenCalledWith(
      expect.objectContaining({
        tracesSampleRate: 1,
        profileSessionSampleRate: 0,
      }),
    );
  });
});
