import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import * as Sentry from "@sentry/node";
import "@sentry/tracing";
import helmet from "helmet";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { ValidationPipe } from "@nestjs/common";
import * as session from "express-session";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe());
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
  app.use(Sentry.Handlers.errorHandler());
  app.use(helmet());
  // Enable CORS with wildcard origin and the specified allowed headers
  app.enableCors({
    credentials: true,
    origin: ["https://localhost:3000", "http://localhost:3000"],
    allowedHeaders: ["content-type"],
    methods: ["GET", "OPTIONS", "POST"],
  });
  app.use(
    session({
      name: process.env.COOKIE_NAME || "connectkit-next-siwe",
      secret: process.env.SESSION_SECRET,
      resave: false,
      cookie: {
        httpOnly: false,
        secure: false,
        sameSite: "lax",
      },
      saveUninitialized: false,
    }),
  );
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
