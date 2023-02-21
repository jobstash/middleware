import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from "axios";
import { AuthService } from "src/auth/auth.service";
import { CreateUserInput } from "src/auth/dto/create-user.input";
import { User } from "src/shared/interfaces";

@Injectable()
export class BackendService {
  private authenticatedClient: Promise<AxiosInstance>;
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    this.authenticatedClient = authService
      .getBackendCredentialsGrantToken()
      .then(token => {
        return axios.create({
          baseURL: configService.get<string>("BACKEND_API_URL"),
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          withCredentials: true,
        });
      });
  }

  async createUser(details: CreateUserInput): Promise<User | undefined> {
    const client = await this.authenticatedClient;
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
}
