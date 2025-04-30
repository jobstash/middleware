import { Module, OnModuleInit } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import * as Sentry from "@sentry/node";
import { nodeProfilingIntegration } from "@sentry/profiling-node";
import { SentryModule } from "@sentry/nestjs/setup";
import { JobsModule } from "./jobs/jobs.module";
import { TagsModule } from "./tags/tags.module";
import { GithubModule } from "./auth/github/github.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import envSchema from "./env-schema";
import { ProjectsModule } from "./projects/projects.module";
import { CacheModule } from "@nestjs/cache-manager";
import { PublicModule } from "./public/public.module";
import { ModelModule } from "./model/model.module";
import { NeogmaModule, NeogmaModuleOptions } from "nestjs-neogma";
import { ProfileModule } from "./auth/profile/profile.module";
import { MailModule } from "./mail/mail.module";
import { HacksModule } from "./hacks/hacks.module";
import { AuditsModule } from "./audits/audits.module";
import { ScorerModule } from "./scorer/scorer.module";
import { ChainsModule } from "./chains/chains.module";
import { InvestorsModule } from "./investors/investors.module";
import { PrivyModule } from "./auth/privy/privy.module";
import { GrantsModule } from "./grants/grants.module";
import { GoogleBigQueryModule } from "./google-bigquery/google-bigquery.module";
import { SearchModule } from "./search/search.module";
import { PaymentsModule } from "./payments/payments.module";
import { UserModule } from "./user/user.module";
import { Auth0Module } from "./auth0/auth0.module";
import { SubscriptionsModule } from "./subscriptions/subscriptions.module";
import { BullModule } from "@nestjs/bull";
import { ScheduleModule } from "@nestjs/schedule";
import { TelemetryModule } from "./telemetry/telemetry.module";
import { EcosystemsModule } from "./ecosystems/ecosystems.module";

@Module({
  imports: [
    SentryModule.forRoot(),
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    NeogmaModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return {
          host: configService.get<string>("NEO4J_HOST"),
          password: configService.get<string>("NEO4J_PASSWORD"),
          port: configService.get<string>("NEO4J_PORT"),
          scheme: configService.get<string>("NEO4J_SCHEME"),
          username: configService.get<string>("NEO4J_USERNAME"),
          database: configService.get<string>("NEO4J_DATABASE"),
        } as NeogmaModuleOptions;
      },
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        redis: {
          host: configService.get<string>("REDIS_HOST"),
          port: configService.get<number>("REDIS_PORT"),
        },
      }),
    }),
    ScheduleModule.forRoot(),
    CacheModule.register({ isGlobal: true }),
    AuthModule,
    JobsModule,
    TagsModule,
    UserModule,
    GithubModule,
    OrganizationsModule,
    ProjectsModule,
    PublicModule,
    ModelModule,
    ProfileModule,
    MailModule,
    HacksModule,
    AuditsModule,
    ScorerModule,
    ChainsModule,
    InvestorsModule,
    PrivyModule,
    GrantsModule,
    GoogleBigQueryModule,
    SearchModule,
    PaymentsModule,
    Auth0Module,
    SubscriptionsModule,
    TelemetryModule,
    EcosystemsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements OnModuleInit {
  constructor(private readonly configService: ConfigService) {}
  onModuleInit(): void {
    Sentry.init({
      dsn: this.configService.get<string>("SENTRY_DSN"),
      tracesSampleRate: parseInt(
        this.configService.get<string>("SENTRY_TRACES_SAMPLE_RATE") ?? "0.2",
      ),
      profilesSampleRate: parseInt(
        this.configService.get<string>("SENTRY_PROFILE_SAMPLE_RATE") ?? "0.2",
      ),
      profileLifecycle: "trace",
      sendDefaultPii: true,
      integrations: [
        nodeProfilingIntegration(),
        Sentry.captureConsoleIntegration(),
        Sentry.dataloaderIntegration(),
        Sentry.extraErrorDataIntegration(),
      ],
    });
  }
}
