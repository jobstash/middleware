import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as Sentry from "@sentry/node";
import axios, { AxiosInstance } from "axios";
import { AuthService } from "src/auth/auth.service";
import { SetFlowStateInput } from "src/auth/dto/set-flow-state.input";
import { SetRoleInput } from "src/auth/dto/set-role.input";
import { GithubUserService } from "src/auth/github/github-user.service";
import { UserService } from "src/auth/user/user.service";
import { GithubLoginInput } from "src/backend/dto/github-login.input";
import { CreateOrganizationInput } from "src/organizations/dto/create-organization.input";
import { UpdateOrganizationInput } from "src/organizations/dto/update-organization.input";
import { CreateProjectInput } from "src/projects/dto/create-project.input";
import { UpdateProjectInput } from "src/projects/dto/update-project.input";
import { USER_FLOWS, USER_ROLES } from "src/shared/constants";
import { propertiesMatch } from "src/shared/helpers";
import {
  GithubUserEntity,
  GithubUserProperties,
  OrganizationProperties,
  PreferredTerm,
  ProjectProperties,
  Response,
  ResponseWithNoData,
  User,
} from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { CreatePairedTermsInput } from "src/technologies/dto/create-paired-terms.input";
import { CreatePreferredTermInput } from "src/technologies/dto/create-preferred-term.input";
import { DeletePreferredTermInput } from "src/technologies/dto/delete-preferred-term.input";
import { BlockedTermsInput } from "src/technologies/dto/set-blocked-term.input";

@Injectable()
export class BackendService {
  private readonly logger = new CustomLogger(BackendService.name);

  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly configService: ConfigService,
    private readonly githubUserService: GithubUserService,
  ) {}

  private async getOrRefreshClient(): Promise<AxiosInstance> {
    const token = await this.authService.getBackendCredentialsGrantToken();
    this.logger.log(`Token for request: ${token.access_token}`);

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

  async addGithubInfoToUser(
    args: GithubLoginInput,
  ): Promise<Response<User> | ResponseWithNoData> {
    const logInfo = {
      ...args,
      githubAccessToken: "[REDACTED]",
      githubRefreshToken: "[REDACTED]",
    };
    this.logger.log(
      `/user/addGithubInfoToUser: Assigning ${args.githubId} github account to wallet ${args.wallet}`,
    );

    const { wallet, ...updateObject } = args;

    try {
      const storedUserNode = await this.userService.findByWallet(wallet);
      if (!storedUserNode) {
        return { success: false, message: "User not found" };
      }
      const githubUserNode = await this.githubUserService.findById(
        updateObject.githubId,
      );

      let persistedGithubNode: GithubUserEntity;

      const payload = {
        id: updateObject.githubId,
        login: updateObject.githubLogin,
        nodeId: updateObject.githubNodeId,
        gravatarId: updateObject.githubGravatarId,
        avatarUrl: updateObject.githubAvatarUrl,
        accessToken: updateObject.githubAccessToken,
        refreshToken: updateObject.githubRefreshToken,
      };

      if (githubUserNode) {
        const githubUserNodeData: GithubUserProperties =
          githubUserNode.getProperties();
        if (propertiesMatch(githubUserNodeData, updateObject)) {
          return { success: false, message: "Github data is identical" };
        }

        persistedGithubNode = await this.githubUserService.update(
          githubUserNode.getId(),
          payload,
        );
      } else {
        persistedGithubNode = await this.githubUserService.create(payload);
        await this.userService.addGithubUser(
          storedUserNode.getId(),
          persistedGithubNode.getId(),
        );
      }

      return {
        success: true,
        message: "Github data persisted",
        data: storedUserNode.getProperties(),
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-request-pipeline",
          source: "backend.service",
        });
        scope.setExtra("input", logInfo);
        Sentry.captureException(err);
      });
      this.logger.error(`BackendService::addGithubInfoToUser ${err.message}`);
      return {
        success: false,
        message: "Error adding github info to user",
      };
    }
  }

  async createSIWEUser(wallet: string): Promise<User | undefined> {
    try {
      this.logger.log(`/user/createUser: Creating user with wallet ${wallet}`);
      const storedUser = await this.userService.findByWallet(wallet);

      if (storedUser) {
        return storedUser.getProperties();
      }

      const newUserDto = {
        wallet: wallet,
      };

      const newUser = await this.userService.create(newUserDto);

      await this.userService.setRole(USER_ROLES.ANON, newUser);
      await this.userService.setFlow(USER_FLOWS.PICK_ROLE, newUser);

      return newUser.getProperties();
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-request-pipeline",
          source: "backend.service",
        });
        scope.setExtra("input", wallet);
        Sentry.captureException(err);
      });
      this.logger.error(`BackendService::createSIWEUser ${err.message}`);
      return undefined;
    }
  }

  async setFlowState(
    input: SetFlowStateInput,
  ): Promise<Response<string> | ResponseWithNoData> {
    this.logger.log(`/user/setFlowState: ${JSON.stringify(input)}`);

    try {
      const { wallet, flow } = input;
      const user = await this.userService.findByWallet(wallet);
      if (!user) {
        this.logger.log(`User with wallet ${wallet} not found!`);
        return {
          success: false,
          message: "Flow not set because wallet could not be found",
        };
      }

      await this.userService.setFlow(flow, user);

      this.logger.log(`Flow ${flow} set for wallet ${wallet}.`);
      return { success: true, message: "Flow set" };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-request-pipeline",
          source: "backend.service",
        });
        scope.setExtra("input", input);
        Sentry.captureException(err);
      });
      this.logger.error(`BackendService::setFlowState ${err.message}`);
      return undefined;
    }
  }

  async setRole(
    input: SetRoleInput,
  ): Promise<Response<string> | ResponseWithNoData> {
    const { wallet, role } = input;
    this.logger.log(`/user/setRole: Setting ${role} role for ${wallet}`);
    const user = await this.userService.findByWallet(wallet);
    if (!user) {
      this.logger.log(`User with wallet ${wallet} not found!`);
      return {
        success: false,
        message: "Role not set because wallet could not be found",
      };
    }

    await this.userService.setRole(role, user);

    this.logger.log(`Role ${role} set for wallet ${wallet}.`);
    return { success: true, message: "Role set" };
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

  async setBlockedTerms(
    input: BlockedTermsInput,
  ): Promise<Response<boolean> | ResponseWithNoData> {
    this.logger.log("setBlockedTerms");
    try {
      const client = await this.getOrRefreshClient();
      this.logger.log(`setBlockedTerms: ${JSON.stringify(input)}`);

      const promises = input.technologyNameList.map(async technologyName => {
        this.logger.log(`Attempting to block term: ${technologyName}`);
        this.logger.log(
          `Attempting to block for wallet: ${input.creatorWallet}`,
        );

        try {
          this.logger.log(`About to call backend`);
          const res = await client
            .post("/technology/createBlockedTechnologyTerm", {
              technologyName: technologyName,
              creatorWallet: input.creatorWallet,
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
              this.logger.error(
                `BackendService::setBlockedTerm ${err.message}`,
              );
              return err;
            });
          this.logger.log(`Backend call complete`);
          this.logger.log(`res.data: ${JSON.stringify(res.data)}`);
          const data = res.data;
          if (data.success === true && data.data) {
            this.logger.log(`Successfully blocked term: ${technologyName}`);
            return {
              ...data.data,
              success: true,
              term: technologyName,
            } as Response<boolean> & { term: string };
          } else {
            this.logger.log(`Failed to block term: ${technologyName}`);
            return {
              ...data.data,
              success: false,
              message: data.message,
              term: technologyName,
            } as ResponseWithNoData & { term: string };
          }
        } catch (error) {
          this.logger.error(`Error blocking term: ${technologyName}`, error);
          return {
            success: false,
            term: technologyName,
          } as ResponseWithNoData & { term: string };
        }
      });

      const results = await Promise.all(promises);
      const failedResults = results.filter(result => !result.success);
      this.logger.log(`Failed results: ${JSON.stringify(failedResults)}`);

      if (failedResults.length === 0) {
        this.logger.log("Successfully blocked all terms");
        return {
          success: true,
          data: true,
        } as Response<boolean>;
      } else {
        this.logger.log("Failed to block all terms");
        return {
          success: false,
          message: `Error blocking terms: ${failedResults
            .map(result => `${result.term} (${result.message})`)
            .join(", ")}`,
        } as ResponseWithNoData;
      }
    } catch (error) {
      this.logger.error("Error in setBlockedTerms", error);
      return {
        success: false,
        message: "Error in setBlockedTerms",
      } as ResponseWithNoData;
    }
  }

  async unsetBlockedTerms(
    input: BlockedTermsInput,
  ): Promise<Response<boolean> | ResponseWithNoData> {
    this.logger.log("***unsetBlockedTerms***");
    try {
      const client = await this.getOrRefreshClient();
      this.logger.log(`unsetBlockedTerms: ${JSON.stringify(input)}`);

      const promises = input.technologyNameList.map(async technologyName => {
        this.logger.log(`Attempting to unblock term: ${technologyName}`);

        try {
          const res = await client.post(
            "/technology/deleteBlockedTechnologyTerm",
            {
              technologyName: technologyName,
              creatorWallet: input.creatorWallet,
            },
          );

          const data = res.data;
          this.logger.log(`data: ${JSON.stringify(data)}`);
          if (data.success === true && data.data) {
            this.logger.log(`Successfully unblocked term: ${technologyName}`);
            return {
              ...data.data,
              success: true,
              term: technologyName,
            } as Response<boolean> & { term: string };
          } else {
            this.logger.log(`Failed to unblock term: ${technologyName}`);
            return {
              ...data.data,
              success: false,
              term: technologyName,
            } as ResponseWithNoData & { term: string };
          }
        } catch (error) {
          this.logger.error(
            `Error unsetting blocked term: ${technologyName}`,
            error,
          );
          return {
            success: false,
            message: `Error unsetting blocked term: ${technologyName}, ${error.message}`,
            term: technologyName,
          } as ResponseWithNoData & { term: string };
        }
      });

      const results = await Promise.all(promises);
      const failedResults = results.filter(result => !result.success);

      if (failedResults.length === 0) {
        return {
          success: true,
          data: true,
        } as Response<boolean>;
      } else {
        return {
          success: false,
          message: `Error unsetting blocked terms: ${failedResults
            .map(result => `${result.term} (${result.message})`)
            .join(", ")}`,
        } as ResponseWithNoData;
      }
    } catch (error) {
      this.logger.error("Error in unsetBlockedTerms", error);
      return {
        success: false,
        message: "Error in unsetBlockedTerms",
      } as ResponseWithNoData;
    }
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
          return data as Response<PreferredTerm>;
        } else {
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
        this.logger.error(`BackendService::createPreferredTerm ${err.message}`);
        return {
          success: false,
          message: "Error creating preferred term",
        };
      });
  }

  async createPairedTerms(
    input: CreatePairedTermsInput,
  ): Promise<Response<boolean> | ResponseWithNoData> {
    const client = await this.getOrRefreshClient();
    this.logger.log(`/technology/pairTerms: ${JSON.stringify(input)}`);

    return client
      .post("/technology/pairTerms", input)
      .then(res => {
        const data = res.data;
        if (data.success) {
          return data as Response<boolean>;
        } else {
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
        this.logger.error(`BackendService::createPairedTerms ${err.message}`);
        return {
          success: false,
          message: "Error creating paired terms",
        };
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
          return data as Response<PreferredTerm>;
        } else {
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
        this.logger.error(`BackendService::deletePreferredTerm ${err.message}`);
        return {
          success: false,
          message: "Error deleting preferred term",
        };
      });
  }
}
