import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Sentry from "@sentry/node";
import axios, { AxiosInstance } from "axios";
import { CreateOrganizationInput } from "src/organizations/dto/create-organization.input";
import { UpdateOrganizationInput } from "src/organizations/dto/update-organization.input";
import { CreateProjectInput } from "src/projects/dto/create-project.input";
import { UpdateProjectInput } from "src/projects/dto/update-project.input";
import {
  OrganizationProperties,
  ProjectProperties,
  Response,
  ResponseWithNoData,
} from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";

@Injectable()
export class BackendService {
  private readonly logger = new CustomLogger(BackendService.name);

  constructor(private readonly configService: ConfigService) {}

  private async getOrRefreshClient(): Promise<AxiosInstance> {
    this.logger.log(`Token for request: ${""}`);

    return axios.create({
      baseURL: this.configService.get<string>("BACKEND_API_URL"),
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${""}`,
      },
      withCredentials: true,
    });
  }

  async createOrganization(
    input: CreateOrganizationInput,
  ): Promise<Response<OrganizationProperties> | ResponseWithNoData> {
    const client = await this.getOrRefreshClient();
    this.logger.log(`/organization/create: ${JSON.stringify(input)}`);

    return client
      .post("/organization/create", input)
      .then(res => {
        const data = res.data;
        if (data.success) {
          return data as Response<OrganizationProperties>;
        } else {
          this.logger.error(
            `Error creating organization ${JSON.stringify(data)}`,
          );
          return data as ResponseWithNoData;
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
  ): Promise<Response<OrganizationProperties> | ResponseWithNoData> {
    const client = await this.getOrRefreshClient();
    this.logger.log(`/organization/update: ${JSON.stringify(input)}`);

    return client
      .post("/organization/update", input)
      .then(res => {
        const data = res.data;
        if (data.success) {
          return data as Response<OrganizationProperties>;
        } else {
          this.logger.error(
            `Error updating organization ${JSON.stringify(data)}`,
          );
          return data as ResponseWithNoData;
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

  async createProject(
    input: CreateProjectInput,
  ): Promise<Response<ProjectProperties> | ResponseWithNoData> {
    const client = await this.getOrRefreshClient();
    this.logger.log(`/project/create: ${JSON.stringify(input)}`);

    return client
      .post("/project/create", input)
      .then(res => {
        const data = res.data;
        if (data.success) {
          return data as Response<ProjectProperties>;
        } else {
          this.logger.error(`Error creating project ${JSON.stringify(data)}`);
          return data as ResponseWithNoData;
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

  async updateProject(
    input: UpdateProjectInput,
  ): Promise<Response<ProjectProperties> | ResponseWithNoData> {
    const client = await this.getOrRefreshClient();
    this.logger.log(`/project/update: ${JSON.stringify(input)}`);

    return client
      .post("/project/update", input)
      .then(res => {
        const data = res.data;
        if (data.success) {
          return data as Response<ProjectProperties>;
        } else {
          this.logger.error(`Error updating project ${JSON.stringify(data)}`);
          return data as ResponseWithNoData;
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
}
