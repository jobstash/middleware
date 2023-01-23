import { Module, OnModuleInit } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AppService } from "./app.service";
import { GraphQLModule } from "@nestjs/graphql";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ApolloDriver, ApolloDriverConfig } from "@nestjs/apollo";
import { Neo4jModule, Neo4jService } from "nest-neo4j/dist";
import { PassportModule } from "@nestjs/passport";
import { JwtModule } from "@nestjs/jwt";
import * as Sentry from "@sentry/node";
import * as Tracing from "@sentry/tracing";

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
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>("JWT_SECRET"),
        signOptions: {
          expiresIn: configService.get<string>("JWT_EXPIRES_IN"),
        },
      }),
    }),
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
