import { Node } from "neo4j-driver";
import { UserClaims } from "../../interfaces/user/user-claims.interface";
import { UserProperties } from "../../interfaces/user/user-properties.interface";

export class User {
  constructor(private readonly node: Node) {}

  id: string;
  email: string;
  password: string;
  accessToken?: string;

  getId(): string {
    // eslint-disable-next-line
    return (<Record<string, any>>this.node.properties).id;
  }

  getPassword(): string {
    // eslint-disable-next-line
    return (<Record<string, any>>this.node.properties).password;
  }

  getClaims(): UserClaims {
    // eslint-disable-next-line
    const { password, ...properties } = <Record<string, any>>(
      this.node.properties
    );

    return properties as UserClaims;
  }

  toJson(): UserProperties {
    // eslint-disable-next-line
    const { password, ...properties } = <Record<string, any>>(
      this.node.properties
    );

    return properties as UserProperties;
  }
}
