import { Node } from "neo4j-driver";
import { UserRole } from "../interfaces";

export class UserRoleEntity {
  constructor(private readonly node: Node) {}

  getId(): string {
    return (<Record<string, string>>this.node.properties).id;
  }

  getName(): string {
    return (<Record<string, string>>this.node.properties).name;
  }

  getProperties(): UserRole {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { ...properties } = <Record<string, any>>this.node.properties;

    return properties as UserRole;
  }
}
