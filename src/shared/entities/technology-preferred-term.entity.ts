import { TechnologyPreferredTerm, Technology } from "../interfaces";

type RawTechnologyPreferredTerm = {
  id: string;
  name: string;
  normalizedName: string;
  technology: object & { properties: Technology };
  synonyms: [object & { properties: Technology }];
};

export class TechnologyPreferredTermEntity {
  constructor(private readonly raw: RawTechnologyPreferredTerm) {}

  getId(): string {
    return this.raw.id;
  }

  getNormalizedName(): string {
    return this.raw.normalizedName;
  }

  getName(): string {
    return this.raw.name;
  }

  getProperties(): TechnologyPreferredTerm {
    return {
      ...this.raw,
      technology: this.raw?.technology.properties,
      synonyms: this.raw?.synonyms.map(syn => syn.properties),
    };
  }
}
