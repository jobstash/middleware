import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import * as Sentry from "@sentry/node";
import "@sentry/tracing";
import helmet from "helmet";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
  app.use(Sentry.Handlers.errorHandler());
  app.use(helmet());
  app.enableCors({
    credentials: true,
    methods: ["GET", "OPTIONS", "POST"],
    origin: process.env.ALLOWED_ORIGINS?.split(",") ?? [],
  });
  await app.listen(process.env.APP_PORT ?? 8080);
}
bootstrap();
