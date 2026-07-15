import { GraphNode } from "../interfaces";
import { User } from "../interfaces/user/user.interface";
export class UserEntity {
  private readonly properties: Record<string, unknown>;

  constructor(node: GraphNode | User) {
    this.properties =
      "properties" in node
        ? (node.properties as Record<string, unknown>)
        : (node as unknown as Record<string, unknown>);
  }

  getId(): string {
    return this.properties.id as string;
  }

  getPrivyd(): string {
    return this.properties.privyd as string;
  }

  getWallet(): string | undefined {
    return this.properties.wallet as string | undefined;
  }

  getProperties(): User {
    const { ...properties } = this.properties;

    return properties as unknown as User;
  }
}
