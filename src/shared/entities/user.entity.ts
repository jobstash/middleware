import { Node } from "neo4j-driver";
import { UserClaims, User } from "src/shared/types";

export class UserEntity {
  constructor(private readonly node: Node) {}

  getId(): string {
    // eslint-disable-next-line
    return (<Record<string, any>>this.node.properties).id;
  }

  getClaims(): UserClaims {
    // eslint-disable-next-line
    const { password, ...properties } = <Record<string, any>>(
      this.node.properties
    );

    const claims: UserClaims = { email: properties.email };

    return claims;
  }

  getProperties(): User {
    // eslint-disable-next-line
    const { password, accessToken, ...properties } = <Record<string, any>>(
      this.node.properties
    );

    return properties as User;
  }
}
