import { Module, OnModuleInit } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import * as Sentry from "@sentry/node";
import * as Tracing from "@sentry/tracing";
import { JobsModule } from "./jobs/jobs.module";
import { TagsModule } from "./tags/tags.module";
import { GithubModule } from "./auth/github/github.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import envSchema from "./env-schema";
import { ProjectsModule } from "./projects/projects.module";
import { CacheModule } from "@nestjs/cache-manager";
import { PublicModule } from "./public/public.module";
import { ModelModule } from "./model/model.module";
import { NeogmaModule, NeogmaModuleOptions } from "nest-neogma";
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

@Module({
  imports: [
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
      useFactory: (configService: ConfigService) =>
        ({
          host: configService.get<string>("NEO4J_HOST"),
          password: configService.get<string>("NEO4J_PASSWORD"),
          port: configService.get<string>("NEO4J_PORT"),
          scheme: configService.get<string>("NEO4J_SCHEME"),
          username: configService.get<string>("NEO4J_USERNAME"),
          database: configService.get<string>("NEO4J_DATABASE"),
        } as NeogmaModuleOptions),
    }),
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements OnModuleInit {
  onModuleInit(): void {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: parseInt(
        process.env.SENTRY_TRACES_SAMPLE_RATE ?? "0.2",
      ),
      environment: process.env.NODE_ENV,
      release: "middleware@" + process.env.npm_package_version,
      integrations: [
        new Sentry.Integrations.Console(),
        new Sentry.Integrations.Modules(),
        new Sentry.Integrations.RequestData(),
        new Sentry.Integrations.Http({ tracing: true }),
        new Sentry.Integrations.ContextLines(),
        new Sentry.Integrations.LocalVariables(),
        new Tracing.Integrations.Apollo(),
      ],
    });
  }
}
