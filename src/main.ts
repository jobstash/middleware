import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import * as Sentry from "@sentry/node";
import "@sentry/tracing";
import helmet from "helmet";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { ValidationPipe } from "@nestjs/common";
import { ironSession } from "iron-session/express";
import { IronSessionOptions } from "iron-session";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as basicAuth from "express-basic-auth";
import * as compression from "compression";
dotenv.config();

if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET must be set");

const ironOptions: IronSessionOptions = {
  password: process.env.SESSION_SECRET,
  cookieName: "session",
  cookieOptions: {
    secure: process.env.NODE_ENV === "production",
  },
};

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    httpsOptions:
      process.env.LOCAL_HTTPS === "yes"
        ? {
            key: fs.readFileSync("./certs/localhost-key.pem"),
            cert: fs.readFileSync("./certs/localhost.pem"),
          }
        : undefined,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      enableDebugMessages: process.env.NODE_ENV === "production" ? false : true,
    }),
  );
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
  app.use(Sentry.Handlers.errorHandler());
  app.use(ironSession(ironOptions));
  app.use(helmet());
  app.use(compression());
  app.enableCors({
    credentials: true,
    origin: process.env.ALLOWED_ORIGINS?.split(","),
    allowedHeaders: ["content-type"],
    methods: ["GET", "OPTIONS", "POST", "DELETE"],
  });
  app.use(
    ["/api", "/api-json", "/api-yaml"],
    basicAuth({
      challenge: true,
      users: { [process.env.SWAGGER_USER]: process.env.SWAGGER_PASSWORD },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle("JobStash Middleware")
    .setDescription(
      "This application provides all the data needed by the various frontends in a unified, latency-optimised way",
    )
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api", app, document);

  await app.listen(process.env.PORT ?? 8080);
}
bootstrap();
