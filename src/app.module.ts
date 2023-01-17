import { Module, OnModuleInit } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import * as Tracing from "@sentry/tracing";

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule implements OnModuleInit {

  constructor() { }

  onModuleInit() {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: parseInt(process.env.SENTRY_TRACES_SAMPLE_RATE),
      environment: process.env.NODE_ENV,
      release: "middleware@" + process.env.npm_package_version,
      integrations: [
        new Sentry.Integrations.Console(),
        new Sentry.Integrations.Modules(),
        new Sentry.Integrations.RequestData(),
        new Sentry.Integrations.Http({ tracing: true, }),
        new Sentry.Integrations.ContextLines(),
        new Sentry.Integrations.LocalVariables(),
        new Tracing.Integrations.Apollo(),
      ],
    });
  }
}