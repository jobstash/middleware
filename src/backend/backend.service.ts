import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from "axios";
import { AuthService } from "src/auth/auth.service";
import { CreateOrganizationInput } from "src/organizations/dto/create-organization.input";
import { UpdateOrganizationInput } from "src/organizations/dto/update-organization.input";
import { CreateProjectInput } from "src/projects/dto/create-project.input";
import { UpdateProjectInput } from "src/projects/dto/update-project.input";
import {
  Organization,
  Project,
  User,
  PreferredTerm,
  Response,
  ResponseWithNoData,
} from "src/shared/types";
import { CreatePairedTermsInput } from "src/technologies/dto/create-paired-terms.input";
import { CreatePreferredTermInput } from "src/technologies/dto/create-preferred-term.input";
import { DeletePreferredTermInput } from "src/technologies/dto/delete-preferred-term.input";
import { SetBlockedTermInput } from "src/technologies/dto/set-blocked-term.input";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";

export interface GithubLoginInput {
  githubAccessToken: string;
  githubRefreshToken: string;
  githubLogin: string;
  githubId: string;
  githubNodeId: string;
  githubGravatarId?: string | undefined;
  githubAvatarUrl: string;
  wallet: string;
  role: string;
}

@Injectable()
export class BackendService {
  logger = new CustomLogger(BackendService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private async getOrRefreshClient(): Promise<AxiosInstance> {
    const token = await this.authService.getBackendCredentialsGrantToken();
    this.logger.log(`Token for request: ${token}`);

    return axios.create({
      baseURL: this.configService.get<string>("BACKEND_API_URL"),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token.access_token}`,
      },
      withCredentials: true,
    });
  }

  async addGithubInfoToUser(args: GithubLoginInput): Promise<User | undefined> {
    const client = await this.getOrRefreshClient();
    const logInfo = {
      ...args,
      githubAccessToken: "[REDACTED]",
      githubRefreshToken: "[REDACTED]",
    };
    this.logger.log(`/user/addGithubInfoToUser: ${logInfo}`);

    return client
      .post("/user/addGithubInfoToUser", args)
      .then(res => {
        const data = res.data;
        if (data.status === "success") {
          return data as User;
        } else {
          return undefined;
        }
      })
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-request-pipeline",
            source: "backend.service",
          });
          scope.setExtra("input", logInfo);
          Sentry.captureException(err);
        });
        this.logger.error(`BackendService::addGithubInfoToUser ${err.message}`);
        return undefined;
      });
  }

  async createSIWEUser(address: string): Promise<User | undefined> {
    const client = await this.getOrRefreshClient();
    this.logger.log(`/user/createUser: ${address}`);
    return client
      .post("/user/createUser", { wallet: address })
      .then(res => {
        const data = res.data;
        if (data.status === "success") {
          return data as User;
        } else {
          return undefined;
        }
      })
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-request-pipeline",
            source: "backend.service",
          });
          scope.setExtra("input", address);
          Sentry.captureException(err);
        });
        this.logger.error(`BackendService::createSIWEUser ${err.message}`);
        return undefined;
      });
  }

  async createOrganization(
    input: CreateOrganizationInput,
  ): Promise<Organization | undefined> {
    const client = await this.getOrRefreshClient();
    this.logger.log(`/organization/create: ${input}`);

    return client
      .post("/organization/create", input)
      .then(res => {
        const data = res.data;
        if (data.success === true && data.data) {
          return data.data as Organization;
        } else {
          return undefined;
        }
      })
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-request-pipeline",
            source: "backend.service",
          });
          scope.setExtra("input", input);
          Sentry.captureException(err);
        });
        this.logger.error(`BackendService::createOrganization ${err.message}`);
        return undefined;
      });
  }

  async updateOrganization(
    input: UpdateOrganizationInput,
  ): Promise<Organization | undefined> {
    const client = await this.getOrRefreshClient();
    this.logger.log(`/organization/update: ${input}`);

    return client
      .post("/organization/update", input)
      .then(res => {
        const data = res.data;
        if (data.success === true && data.data) {
          return data.data as Organization;
        } else {
          return undefined;
        }
      })
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-request-pipeline",
            source: "backend.service",
          });
          scope.setExtra("input", input);
          Sentry.captureException(err);
        });
        this.logger.error(`BackendService::updateOrganization ${err.message}`);
        return undefined;
      });
  }

  async createProject(input: CreateProjectInput): Promise<Project | undefined> {
    const client = await this.getOrRefreshClient();
    this.logger.log(`/project/create: ${input}`);

    return client
      .post("/project/create", input)
      .then(res => {
        const data = res.data;
        if (data.status === "success") {
          return data.data as Project;
        } else {
          return undefined;
        }
      })
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-request-pipeline",
            source: "backend.service",
          });
          scope.setExtra("input", input);
          Sentry.captureException(err);
        });
        this.logger.error(`BackendService::createProject ${err.message}`);
        return undefined;
      });
  }

  async updateProject(input: UpdateProjectInput): Promise<Project | undefined> {
    const client = await this.getOrRefreshClient();
    this.logger.log(`/project/update: ${input}`);

    return client
      .post("/project/update", input)
      .then(res => {
        const data = res.data;
        if (data.status === "success") {
          return data.data as Project;
        } else {
          return undefined;
        }
      })
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-request-pipeline",
            source: "backend.service",
          });
          scope.setExtra("input", input);
          Sentry.captureException(err);
        });
        this.logger.error(`BackendService::updateProject ${err.message}`);
        return undefined;
      });
  }

  async setBlockedTerm(
    input: SetBlockedTermInput,
  ): Promise<Response<boolean> | ResponseWithNoData> {
    const client = await this.getOrRefreshClient();
    this.logger.log(`/technology/createBlockedTechnologyTerm: ${input}`);

    return client
      .post("/technology/createBlockedTechnologyTerm", input)
      .then(res => {
        const data = res.data;
        if (data.status === "success") {
          return data.data as Response<boolean>;
        } else {
          return data.data as ResponseWithNoData;
        }
      })
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-request-pipeline",
            source: "backend.service",
          });
          scope.setExtra("input", input);
          Sentry.captureException(err);
        });
        this.logger.error(`BackendService::setBlockedTerm ${err.message}`);
        return undefined;
      });
  }

  async createPreferredTerm(
    input: CreatePreferredTermInput,
  ): Promise<Response<PreferredTerm> | ResponseWithNoData> {
    const client = await this.getOrRefreshClient();
    this.logger.log(`/technology/createPreferredTechnologyTerm: ${input}`);

    return client
      .post("/technology/createPreferredTechnologyTerm", input)
      .then(res => {
        const data = res.data;
        if (data.success) {
          return data.data as Response<PreferredTerm>;
        } else {
          return data.data as ResponseWithNoData;
        }
      })
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-request-pipeline",
            source: "backend.service",
          });
          scope.setExtra("input", input);
          Sentry.captureException(err);
        });
        this.logger.error(`BackendService::createPreferredTerm ${err.message}`);
        return undefined;
      });
  }

  async createPairedTerms(
    input: CreatePairedTermsInput,
  ): Promise<Response<boolean> | ResponseWithNoData> {
    const client = await this.getOrRefreshClient();
    this.logger.log(`/technology/pairTerms: ${input}`);

    return client
      .post("/technology/pairTerms", input)
      .then(res => {
        const data = res.data;
        if (data.success) {
          return data.data as Response<boolean>;
        } else {
          return data.data as ResponseWithNoData;
        }
      })
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-request-pipeline",
            source: "backend.service",
          });
          scope.setExtra("input", input);
          Sentry.captureException(err);
        });
        this.logger.error(`BackendService::createPairedTerms ${err.message}`);
        return undefined;
      });
  }

  async deletePreferredTerm(
    input: DeletePreferredTermInput,
  ): Promise<Response<PreferredTerm> | ResponseWithNoData> {
    const client = await this.getOrRefreshClient();
    this.logger.log(`/technology/deletePreferredTechnologyTerm: ${input}`);

    return client
      .post("/technology/deletePreferredTechnologyTerm", input)
      .then(res => {
        const data = res.data;
        if (data.success) {
          return data.data as Response<PreferredTerm>;
        } else {
          return data.data as ResponseWithNoData;
        }
      })
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "service-request-pipeline",
            source: "backend.service",
          });
          scope.setExtra("input", input);
          Sentry.captureException(err);
        });
        this.logger.error(`BackendService::deletePreferredTerm ${err.message}`);
        return undefined;
      });
  }
}
