import { Node } from "neo4j-driver";
import { BlockedTag } from "../interfaces";

export class BlockedTagEntity {
  constructor(private readonly node: Node) {}

  getId(): string {
    return (<Record<string, string>>this.node.properties).id;
  }

  getTagName(): boolean {
    return (<Record<string, boolean>>this.node.properties).tagName;
  }

  getCreatorWallet(): boolean {
    return (<Record<string, boolean>>this.node.properties).creatorWallet;
  }

  getProperties(): BlockedTag {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { ...properties } = <Record<string, any>>this.node.properties;

    return properties as BlockedTag;
  }
}
