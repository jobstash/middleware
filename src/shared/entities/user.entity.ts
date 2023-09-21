import { Node } from "neo4j-driver";
import { User } from "../interfaces/user/user.interface";
export class UserEntity {
  constructor(private readonly node: Node) {}

  getId(): string {
    return (<Record<string, string>>this.node.properties).id;
  }

  getWallet(): string | undefined {
    return (<Record<string, string>>this.node.properties).wallet;
  }

  getAvailable(): boolean | undefined {
    return (<Record<string, boolean>>this.node.properties).available;
  }

  getGithubLogin(): string | undefined {
    return (<Record<string, string>>this.node.properties).githubLogin;
  }

  getGithubNodeId(): string | undefined {
    return (<Record<string, string>>this.node.properties).githubNodeId;
  }

  getGithubGravatarId(): string | undefined {
    return (<Record<string, string>>this.node.properties).githubGravatarId;
  }

  getGithubAvatarUrl(): string | undefined {
    return (<Record<string, string>>this.node.properties).githubAvatarUrl;
  }

  getGithubId(): number | undefined {
    return (<Record<string, number>>this.node.properties).githubId;
  }

  getGithubAccessToken(): string | undefined {
    return (<Record<string, string>>this.node.properties).githubAccessToken;
  }

  getGithubRefreshToken(): string | undefined {
    return (<Record<string, string>>this.node.properties).githubRefreshToken;
  }

  getProperties(): User {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { ...properties } = <Record<string, any>>this.node.properties;

    return properties as User;
  }
}
