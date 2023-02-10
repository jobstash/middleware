import { Node } from "neo4j-driver";
import { User } from "src/shared/types";

export class UserEntity {
  constructor(private readonly node: Node) {}

  getId(): string {
    // eslint-disable-next-line
    return (<Record<string, any>>this.node.properties).id;
  }

  getProperties(): User {
    // eslint-disable-next-line
    const { password, accessToken, ...properties } = <Record<string, any>>(
      this.node.properties
    );

    return properties as User;
  }
}
