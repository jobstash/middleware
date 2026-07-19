import cluster from "node:cluster";
import { availableParallelism } from "node:os";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import "@sentry/tracing";
import helmet from "helmet";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { ValidationPipe } from "@nestjs/common";
import { ironSession } from "iron-session/express";
import { IronSessionOptions } from "iron-session";
import * as dotenv from "dotenv";
// import * as express from "express";
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
    rawBody: true,
    bodyParser: true,
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
    allowedHeaders: ["content-type", "x-ecosystem", "authorization"],
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

const start = async (): Promise<void> => {
  if (process.env.NODE_ENV !== "production" || !cluster.isPrimary) {
    await bootstrap();
    return;
  }

  const workerCount = Math.min(4, availableParallelism());
  let scheduleOwnerId: number | undefined;
  for (let index = 0; index < workerCount; index += 1) {
    const ownsScheduledJobs = index === 0;
    const worker = cluster.fork({
      MIDDLEWARE_SCHEDULE_OWNER: ownsScheduledJobs ? "1" : "0",
    });
    if (ownsScheduledJobs) scheduleOwnerId = worker.id;
  }

  cluster.on("exit", worker => {
    const ownsScheduledJobs = worker.id === scheduleOwnerId;
    const replacement = cluster.fork({
      MIDDLEWARE_SCHEDULE_OWNER: ownsScheduledJobs ? "1" : "0",
    });
    if (ownsScheduledJobs) scheduleOwnerId = replacement.id;
  });
};

void start();
