import { HttpService } from "@nestjs/axios";
import { Injectable } from "@nestjs/common";
import { AxiosError } from "axios";
import { catchError, firstValueFrom } from "rxjs";
import { UserWorkHistory } from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";

@Injectable()
export class ScorerService {
  private logger = new CustomLogger(ScorerService.name);

  constructor(private readonly httpService: HttpService) {}

  getWorkHistory = async (
    users: string[],
  ): Promise<{ user: string; workHistory: UserWorkHistory[] }[]> => {
    const res = await firstValueFrom(
      this.httpService
        .get<{ user: string; workHistory: UserWorkHistory[] }[]>(
          `/scorer/users/history?users=${users.join(",")}`,
        )
        .pipe(
          catchError((err: AxiosError) => {
            Sentry.withScope(scope => {
              scope.setTags({
                action: "service-call",
                source: "user.service",
              });
              scope.setExtra("input", users);
              Sentry.captureException(err);
            });
            this.logger.error(`ScorerService::getWorkHistory ${err.message}`);
            return [];
          }),
        ),
    );
    return res.data;
  };
}
