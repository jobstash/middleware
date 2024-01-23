import { Node } from "neo4j-driver";
import { GithubUser } from "../interfaces/github-user.interface";

export class GithubUserEntity {
  constructor(private readonly node: Node) {}

  getId(): string {
    return (<Record<string, string>>this.node.properties).id;
  }

  getLogin(): string | undefined {
    return (<Record<string, string>>this.node.properties).login;
  }

  getNodeId(): string | undefined {
    return (<Record<string, string>>this.node.properties).nodeId;
  }

  getGravatarId(): string | undefined {
    return (<Record<string, string>>this.node.properties).gravatarId;
  }

  getAvatarUrl(): string | undefined {
    return (<Record<string, string>>this.node.properties).avatarUrl;
  }

  getAccessToken(): string | undefined {
    return (<Record<string, string>>this.node.properties).accessToken;
  }

  getRefreshToken(): string | undefined {
    return (<Record<string, string>>this.node.properties).refreshToken;
  }

  getProperties(): GithubUser {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { ...properties } = <Record<string, any>>this.node.properties;

    return properties as GithubUser;
  }
}
