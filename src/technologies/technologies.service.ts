import { Injectable } from "@nestjs/common";
import { TechnologyPreferredTerm } from "src/shared/interfaces/technology-preferred-term.interface";
import { PairedTerm, Technology } from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { ModelService } from "src/model/model.service";

@Injectable()
export class TechnologiesService {
  logger = new CustomLogger(TechnologiesService.name);
  constructor(private models: ModelService) {}

  async getAll(): Promise<Technology[]> {
    try {
      return this.models.Technologies.getAllowedTerms();
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "technologies.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`TechnologiesService::getAll ${err.message}`);
      return undefined;
    }
  }

  async getBlockedTerms(): Promise<Technology[]> {
    try {
      return this.models.Technologies.getBlockedTerms();
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "technologies.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`TechnologiesService::getBlockedTerms ${err.message}`);
      return undefined;
    }
  }

  async getPreferredTerms(): Promise<TechnologyPreferredTerm[]> {
    try {
      return this.models.Technologies.getPreferredTerms();
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "technologies.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(
        `TechnologiesService::getPreferredTerms ${err.message}`,
      );
      return undefined;
    }
  }

  async getPairedTerms(): Promise<PairedTerm[]> {
    try {
      return this.models.Technologies.getPairedTerms();
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "technologies.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`TechnologiesService::getPairedTerms ${err.message}`);
      return undefined;
    }
  }
}
