import { Injectable } from "@nestjs/common";
import { Neo4jService } from "nest-neo4j";
import { TechnologyPreferredTermEntity } from "src/shared/entities/technology-preferred-term.entity";
import { TechnologyPreferredTerm } from "src/shared/interfaces/technology-preferred-term.interface";
import { Technology } from "src/shared/types";

@Injectable()
export class TechnologiesService {
  constructor(private readonly neo4jService: Neo4jService) {}

  async getAll(): Promise<Technology[]> {
    return this.neo4jService
      .read(
        `
      MATCH (t:Technology)
      WHERE NOT (t)<-[:IS_BLOCKED_TERM]-()
      AND (t)<-[:IS_PREFERRED_TERM_OF]-(:PreferredTerm)
      AND (t)<-[:IS_PAIRED_WITH]-(:TechnologyPairing)-[:IS_PAIRED_WITH]->(:Technology)
      RETURN t
      `,
      )
      .then(res =>
        res.records.map(record => record.get("t").properties as Technology),
      );
  }

  async getBlockedTerms(): Promise<Technology[]> {
    return this.neo4jService
      .read(
        `
      MATCH (t:Technology)
      WHERE (t)<-[:IS_BLOCKED_TERM]-()
      RETURN t
      `,
      )
      .then(res =>
        res.records.map(record => record.get("t").properties as Technology),
      );
  }

  async getPreferredTerms(): Promise<TechnologyPreferredTerm[]> {
    return this.neo4jService
      .read(
        `
      MATCH (pt:PreferredTerm)
      WHERE (pt)-[:IS_PREFERRED_TERM_OF]-(t:Technology)
      MATCH (t)<-[:IS_SYNONYM_OF*]-(syn: Technology)
      WITH pt, COLLECT(syn) as synonyms, t
      RETURN pt {
        .*,
        technology: t,
        synonyms: synonyms
      } as res
      `,
      )
      .then(res =>
        res.records.map(record =>
          new TechnologyPreferredTermEntity(
            record.get("res").properties,
          ).getProperties(),
        ),
      );
  }
}
