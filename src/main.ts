import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as Sentry from '@sentry/node';
import "@sentry/tracing";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
  app.use(Sentry.Handlers.errorHandler());
  await app.listen(process.env.APP_PORT);

}
bootstrap();
