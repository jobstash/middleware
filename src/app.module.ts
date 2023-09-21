import { Module, OnModuleInit } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import * as Sentry from "@sentry/node";
import * as Tracing from "@sentry/tracing";
import { Neo4jConnection, Neo4jModule } from "nest-neo4j/dist";
import { JobsModule } from "./jobs/jobs.module";
import { BackendModule } from "./backend/backend.module";
import { SiweModule } from "./auth/siwe/siwe.module";
import { TechnologiesModule } from "./technologies/technologies.module";
import { GithubModule } from "./auth/github/github.module";
import { OrganizationsModule } from "./organizations/organizations.module";
import envSchema from "./env-schema";
import { ProjectsModule } from "./projects/projects.module";
import { CacheModule } from "@nestjs/cache-manager";
import { PublicModule } from './public/public.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: envSchema,
      validationOptions: {
        abortEarly: false,
      },
    }),
    Neo4jModule.forRootAsync({
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
        } as Neo4jConnection),
    }),
    CacheModule.register({ isGlobal: true }),
    AuthModule,
    JobsModule,
    BackendModule,
    SiweModule,
    TechnologiesModule,
    GithubModule,
    OrganizationsModule,
    ProjectsModule,
    PublicModule,
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
