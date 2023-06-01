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

  getProperties(): TechnologyPreferredTerm {
    return {
      ...this.raw,
      technology: this.raw?.technology.properties,
      synonyms: this.raw?.synonyms.map(syn => syn.properties),
    };
  }
}
