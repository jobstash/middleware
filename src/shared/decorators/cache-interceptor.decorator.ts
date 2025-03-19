import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { CACHE_CONTROL_HEADER, CACHE_EXPIRY } from "../constants";
import { CustomLogger } from "../utils/custom-logger";

@Injectable()
export class CacheHeaderInterceptor implements NestInterceptor {
  private readonly logger = new CustomLogger(CacheHeaderInterceptor.name);
  constructor(private readonly duration: number) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler<unknown>,
  ): Observable<unknown> {
    return next.handle().pipe(
      tap(() => {
        const http = context.switchToHttp();
        const res = http.getResponse();

        const expiry = CACHE_EXPIRY(this.duration);

        this.logger.log(
          `Setting cache headers for ${context.getClass().name}::${context.getHandler().name} with expiry ${expiry}`,
        );

        res.setHeader("Cache-Control", CACHE_CONTROL_HEADER(this.duration));
        res.setHeader("Expires", expiry);
      }),
    );
  }
}
