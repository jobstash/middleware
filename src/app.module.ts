import { Module, OnModuleInit } from "@nestjs/common";
import { AppResolver } from "./app.resolver";
import { AppService } from "./app.service";
import { GraphQLModule } from "@nestjs/graphql";
import { ConfigModule } from "@nestjs/config";
import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import { AuthModule } from "./auth/auth.module";
import * as Sentry from "@sentry/node";
import * as Tracing from "@sentry/tracing";
import { Neo4jModule } from "nest-neo4j/dist";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      debug: process.env.NODE_ENV === "development",
      playground: process.env.NODE_ENV === "development",
      autoSchemaFile: true,
      cors: {
        credentials: true,
        methods: ["GET", "OPTIONS", "POST"],
        origin: process.env.ALLOWED_ORIGINS?.split(",") ?? [],
      },
    }),
    Neo4jModule.fromEnv(),
    AuthModule,
  ],
  providers: [AppResolver, AppService],
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
