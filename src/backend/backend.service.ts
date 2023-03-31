import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from "axios";
import { AuthService } from "src/auth/auth.service";
import { CreateOrganizationInput } from "src/organizations/dto/create-organization.input";
import { UpdateOrganizationInput } from "src/organizations/dto/update-organization.input";
import { CreateProjectInput } from "src/projects/dto/create-project.input";
import { UpdateProjectInput } from "src/projects/dto/update-project.input";
import { Organization, Project, User } from "src/shared/types";

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
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {}

  private async getOrRefreshClient(): Promise<AxiosInstance> {
    const token = await this.authService.getBackendCredentialsGrantToken();
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
    return client.post("/user/addGithubInfoToUser", args).then(res => {
      const data = res.data;
      if (data.status === "success") {
        return data as User;
      } else {
        return undefined;
      }
    });
  }

  async createSIWEUser(address: string): Promise<User | undefined> {
    const client = await this.getOrRefreshClient();
    return client.post("/user/createUser", { wallet: address }).then(res => {
      const data = res.data;
      if (data.status === "success") {
        return data as User;
      } else {
        return undefined;
      }
    });
  }

  async createOrganization(
    input: CreateOrganizationInput,
  ): Promise<Organization | undefined> {
    const client = await this.getOrRefreshClient();
    return client.post("/organization/create", input).then(res => {
      const data = res.data;
      if (data.success === true && data.data) {
        return data.data as Organization;
      } else {
        return undefined;
      }
    });
  }

  async updateOrganization(
    input: UpdateOrganizationInput,
  ): Promise<Organization | undefined> {
    const client = await this.getOrRefreshClient();
    return client.post("/organization/update", input).then(res => {
      const data = res.data;
      if (data.status === "success") {
        return data as Organization;
      } else {
        return undefined;
      }
    });
  }

  async createProject(input: CreateProjectInput): Promise<Project | undefined> {
    const client = await this.getOrRefreshClient();
    return client.post("/project/create", input).then(res => {
      const data = res.data;
      if (data.status === "success") {
        return data as Project;
      } else {
        return undefined;
      }
    });
  }

  async updateProject(input: UpdateProjectInput): Promise<Project | undefined> {
    const client = await this.getOrRefreshClient();
    return client.post("/project/update", input).then(res => {
      const data = res.data;
      if (data.status === "success") {
        return data as Project;
      } else {
        return undefined;
      }
    });
  }
}
