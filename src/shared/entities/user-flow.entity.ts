import { Node } from "neo4j-driver";
import { UserFlow } from "src/shared/types";

export class UserFlowEntity {
  constructor(private readonly node: Node) {}

  getId(): string {
    return (<Record<string, string>>this.node.properties).id;
  }

  getName(): string {
    return (<Record<string, string>>this.node.properties).name;
  }

  getProperties(): UserFlow {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { ...properties } = <Record<string, any>>this.node.properties;

    return properties as UserFlow;
  }
}
