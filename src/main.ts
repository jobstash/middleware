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
dotenv.config();

console.log("NEO4J_PASSWORD: " + process.env.NEO4J_PASSWORD);
console.log("NEO4J_HOST: " + process.env.NEO4J_HOST);
console.log("NEO4J_PORT: " + process.env.NEO4J_PORT);
console.log("NEO4J_SCHEME: " + process.env.NEO4J_SCHEME);
console.log("NEO4J_USERNAME: " + process.env.NEO4J_USERNAME);

if (!process.env.SESSION_SECRET) throw new Error("SESSION_SECRET must be set");

const ironOptions: IronSessionOptions = {
  password: process.env.SESSION_SECRET,
  cookieName: "session",
  cookieOptions: {
    secure: false,
    sameSite: "none",
  },
};

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
  app.use(Sentry.Handlers.errorHandler());
  app.use(ironSession(ironOptions));
  app.use(helmet());
  // Enable CORS with wildcard origin and the specified allowed headers
  app.enableCors({
    credentials: true,
    origin: ["https://localhost:3000", "http://localhost:3000"],
    allowedHeaders: ["content-type"],
    methods: ["GET", "OPTIONS", "POST"],
  });

  const config = new DocumentBuilder()
    .setTitle("Recruiters.RIP Middleware")
    .setDescription(
      "This application provides all the data needed by the various frontends in a unified, latency-optimised way",
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api", app, document);

  await app.listen(process.env.APP_PORT ?? 8080);
}
bootstrap();
