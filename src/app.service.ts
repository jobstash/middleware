import { Injectable } from '@nestjs/common';
import * as Sentry from '@sentry/node';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }

  testSentry(): string {
    const transaction = Sentry.startTransaction({
      op: 'test',
      name: 'My First Test Transaction',
    });

    setTimeout(() => {
      try {
        throw new Error('Sentry Test');
      } catch (e) {
        Sentry.captureException(e);
      } finally {
        transaction.finish();
      }
    }, 99);
    return 'Test Complete!';
  }
}
