import { Node } from "neo4j-driver";
import { JobFilterConfigs } from "src/shared/types";

export class JobFilterConfigsEntity {
  constructor(private readonly node: Node) {}

  getProperties(): JobFilterConfigs {
    // eslint-disable-next-line
    const properties = <Record<string, any>>this.node.properties;

    return properties as JobFilterConfigs;
  }
}
