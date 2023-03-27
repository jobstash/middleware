import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from "axios";
import { AuthService } from "src/auth/auth.service";
import { CreateUserInput } from "src/auth/dto/create-user.input";
import { User } from "src/shared/interfaces";

export interface GithubLoginInput {
  githubAccessToken: string;
  githubRefreshToken: string;
  githubLogin: string;
  githubId: string;
  githubNodeId: string;
  githubGravatarId?: string | undefined;
  githubAvatarUrl: string;
  wallet: string;
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

  async createUser(details: CreateUserInput): Promise<User | undefined> {
    const client = await this.getOrRefreshClient();
    console.log(details);
    return client.post("/user/createUser", details).then(res => {
      const data = res.data;
      console.log(data as User);
      if (data.status === "success") {
        return data as User;
      } else {
        return undefined;
      }
    });
  }

  async addGithubInfoToUser(args: GithubLoginInput): Promise<User | undefined> {
    const client = await this.getOrRefreshClient();
    return client.post("/user/addGithubToUser", args).then(res => {
      const data = res.data;
      console.log(data as User);
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
      console.log(data as User);
      if (data.status === "success") {
        return data as User;
      } else {
        return undefined;
      }
    });
  }
}
