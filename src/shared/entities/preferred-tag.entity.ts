import { PreferredTag, Tag } from "../interfaces";

type RawPreferredTag = {
  id: string;
  name: string;
  normalizedName: string;
  tag: object & { properties: Tag };
  synonyms: [object & { properties: Tag }];
};

export class PreferredTagEntity {
  constructor(private readonly raw: RawPreferredTag) {}

  getId(): string {
    return this.raw.id;
  }

  getNormalizedName(): string {
    return this.raw.normalizedName;
  }

  getName(): string {
    return this.raw.name;
  }

  getProperties(): PreferredTag {
    return {
      ...this.raw,
      tag: this.raw?.tag.properties,
      synonyms: this.raw?.synonyms.map(syn => syn.properties),
    };
  }
}
