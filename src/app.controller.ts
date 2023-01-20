import { Controller, Get } from "@nestjs/common";
import { AppService } from "./app.service";
import * as Sentry from "@sentry/node";

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get("test/sentry")
  testSentry(): string {
    const transaction = Sentry.startTransaction({
      op: "test",
      name: "My First Test Transaction",
    });

    setTimeout(() => {
      try {
        throw new Error("Sentry Test");
      } catch (e) {
        Sentry.captureException(e);
      } finally {
        transaction.finish();
      }
    }, 99);

    return "Test Complete!";
  }
}
