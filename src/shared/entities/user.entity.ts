import { Node } from "neo4j-driver";
import { User } from "../interfaces/user/user.interface";
export class UserEntity {
  constructor(private readonly node: Node) {}

  getId(): string {
    return (<Record<string, string>>this.node.properties).id;
  }

  getPrivyd(): string {
    return (<Record<string, string>>this.node.properties).privyd;
  }

  getWallet(): string | undefined {
    return (<Record<string, string>>this.node.properties).wallet;
  }

  getProperties(): User {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { ...properties } = <Record<string, any>>this.node.properties;

    return properties as User;
  }
}
