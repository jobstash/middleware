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
import * as express from "express";
import * as basicAuth from "express-basic-auth";
import * as compression from "compression";
import { OrganizationsModule } from "./organizations/organizations.module";
import { ProjectsModule } from "./projects/projects.module";
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
    allowedHeaders: ["content-type", "x-ecosystem"],
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
    .setTitle("JobStash Middleware")
    .setDescription(
      "This application provides all the data needed by the various frontends in a unified, latency-optimised way",
    )
    .build();
  let publicDocument = SwaggerModule.createDocument(app, publicConfig, {
    include: [OrganizationsModule, ProjectsModule],
  });

  const blocklist = [
    "/organizations",
    "/organizations/featured",
    "/organizations/{id}",
    "/organizations/upload-logo",
    "/organizations/create",
    "/organizations/update/{id}",
    "/organizations/delete/{id}",
    "/organizations/add-alias",
    "/organizations/communities",
    "/organizations/jobsites/activate",
    "/organizations/repositories/{id}",
    "/projects",
    "/projects/all/{id}",
    "/projects/{id}",
    "/projects/prefiller",
    "/projects/upload-logo",
    "/projects/create",
    "/projects/update/{id}",
    "/projects/delete/{id}",
    "/projects/metrics/update/{id}",
    "/projects/metrics/delete/{id}",
    "/projects/link-jobs",
    "/projects/unlink-jobs",
    "/projects/link-repos",
    "/projects/unlink-repos",
  ];

  publicDocument = {
    ...document,
    paths: Object.fromEntries(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      Object.entries(publicDocument.paths).filter(([path, _]) => {
        return !blocklist.includes(path);
      }),
    ),
  };

  SwaggerModule.setup("public-api", app, publicDocument);

  await app.listen(process.env.PORT ?? 8080);
}
bootstrap();
