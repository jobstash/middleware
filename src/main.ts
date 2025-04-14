import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import "@sentry/tracing";
import helmet from "helmet";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { ValidationPipe } from "@nestjs/common";
import { ironSession } from "iron-session/express";
import { IronSessionOptions } from "iron-session";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as express from "express";
import * as basicAuth from "express-basic-auth";
import * as compression from "compression";
import { PublicModule } from "./public/public.module";
import { generatePublicApiSpec } from "./shared/helpers";
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
  app.use(ironSession(ironOptions));
  app.use(helmet());
  app.use(compression());
  app.enableCors({
    credentials: true,
    origin: process.env.ALLOWED_ORIGINS?.split(","),
    allowedHeaders: ["content-type", "x-community", "authorization"],
    methods: ["GET", "OPTIONS", "POST", "DELETE"],
  });
  app.use(
    ["/api", "/api-json", "/api-yaml"],
    basicAuth({
      challenge: true,
      users: { [process.env.SWAGGER_USER]: process.env.SWAGGER_PASSWORD },
    }),
  );
  app.use(express.json({ limit: "50mb" }));

  const config = new DocumentBuilder()
    .setTitle("JobStash Middleware")
    .setDescription(
      "This application provides all the data needed by the various frontends in a unified, latency-optimised way",
    )
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api", app, document);

  const publicConfig = new DocumentBuilder()
    .setTitle("JobStash Public API")
    .setDescription(
      "This application provides third-party access to public data from the JobStash dataset",
    )
    .addBearerAuth()
    .build();
  const publicDocument = generatePublicApiSpec(
    SwaggerModule.createDocument(app, publicConfig, {
      include: [PublicModule],
    }),
  );

  SwaggerModule.setup("public-api", app, publicDocument);

  await app.listen(process.env.PORT ?? 8080);
}
bootstrap();
