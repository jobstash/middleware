import { GraphNode } from "../interfaces";
import { GithubUser } from "../interfaces/github-user.interface";

export class GithubUserEntity {
  private readonly properties: Record<string, unknown>;

  constructor(node: GraphNode | GithubUser) {
    this.properties =
      "properties" in node
        ? (node.properties as Record<string, unknown>)
        : (node as unknown as Record<string, unknown>);
  }

  getId(): string {
    return this.properties.id as string;
  }

  getLogin(): string | undefined {
    return this.properties.login as string | undefined;
  }

  getNodeId(): string | undefined {
    return this.properties.nodeId as string | undefined;
  }

  getAvatarUrl(): string | undefined {
    return this.properties.avatarUrl as string | undefined;
  }

  getAccessToken(): string | undefined {
    return this.properties.accessToken as string | undefined;
  }

  getRefreshToken(): string | undefined {
    return this.properties.refreshToken as string | undefined;
  }

  getProperties(): GithubUser {
    const { ...properties } = this.properties;

    return properties as unknown as GithubUser;
  }
}
