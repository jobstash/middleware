import { Injectable } from "@nestjs/common";
import { Neo4jService } from "nest-neo4j/dist";
import { ShortOrgEntity, ShortOrg } from "src/shared/types";

@Injectable()
export class OrganizationsService {
  constructor(private readonly neo4jService: Neo4jService) {}

  async getAll(): Promise<ShortOrg[]> {
    return this.neo4jService
      .read(
        `
        MATCH (o:Organization)
        OPTIONAL MATCH (o)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(jp:Jobpost)
        OPTIONAL MATCH (jp)-[:HAS_STRUCTURED_JOBPOST]->(j:StructuredJobpost)
        OPTIONAL MATCH (o)-[:HAS_FUNDING_ROUND]->(fr:FundingRound)
        OPTIONAL MATCH (o)-[:HAS_PROJECT]->(p:Project)
        OPTIONAL MATCH (j)-[:USES_TECHNOLOGY]->(t:Technology)
        WHERE NOT (t)<-[:IS_BLOCKED_TERM]-()
        AND (t)<-[:IS_PREFERRED_TERM_OF]-(:PreferredTerm)
        AND (t)<-[:IS_PAIRED_WITH]-(:TechnologyPairing)-[:IS_PAIRED_WITH]->(:Technology)
        WITH o.orgId as id, o.logoUrl as logo, o.name as name, o.location as location, o.headCount as headCount, COUNT(DISTINCT p) as projectCount, COUNT(DISTINCT j) as jobCount, COLLECT(DISTINCT t) as technologies, fr
        ORDER BY fr.date DESC
        WITH id, name, logo, location, headCount, projectCount, jobCount, technologies, collect(fr)[0] as mrfr
        RETURN { id: id, name: name, logo: logo, location: location, headCount: headCount, projectCount: projectCount, jobCount: jobCount, technologies: technologies, lastFundingAmount: mrfr.raisedAmount, lastFundingDate: mrfr.date } as res
        `,
      )
      .then(res =>
        res.records.map(record => {
          const ent = new ShortOrgEntity(record.get("res")).getProperties();
          return ent;
        }),
      );
  }

  async searchOrganizations(query: string): Promise<ShortOrg[]> {
    return this.neo4jService
      .read(
        `
        MATCH (o:Organization)
        OPTIONAL MATCH (o)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(jp:Jobpost)
        OPTIONAL MATCH (jp)-[:HAS_STRUCTURED_JOBPOST]->(j:StructuredJobpost)
        OPTIONAL MATCH (o)-[:HAS_FUNDING_ROUND]->(fr:FundingRound)
        OPTIONAL MATCH (o)-[:HAS_PROJECT]->(p:Project)
        OPTIONAL MATCH (j)-[:USES_TECHNOLOGY]->(t:Technology)
        WHERE NOT (t)<-[:IS_BLOCKED_TERM]-()
        AND (t)<-[:IS_PREFERRED_TERM_OF]-(:PreferredTerm)
        AND (t)<-[:IS_PAIRED_WITH]-(:TechnologyPairing)-[:IS_PAIRED_WITH]->(:Technology)
        WITH o.orgId as id, o.logoUrl as logo, o.name as name, o.location as location, o.headCount as headCount, COUNT(DISTINCT p) as projectCount, COUNT(DISTINCT j) as jobCount, COLLECT(DISTINCT t) as technologies, fr
        ORDER BY fr.date DESC
        WITH id, name, logo, location, headCount, projectCount, jobCount, technologies, collect(fr)[0] as mrfr
        WHERE name CONTAINS $query
        RETURN { id: id, name: name, logo: logo, location: location, headCount: headCount, projectCount: projectCount, jobCount: jobCount, technologies: technologies, lastFundingAmount: mrfr.raisedAmount, lastFundingDate: mrfr.date } as res
        `,
        { query },
      )
      .then(res =>
        res.records.map(record =>
          new ShortOrgEntity(record.get("res")).getProperties(),
        ),
      );
  }

  async getOrgById(id: string): Promise<ShortOrg | undefined> {
    return this.neo4jService
      .read(
        `
        MATCH (o:Organization)
        OPTIONAL MATCH (o)-[:HAS_JOBSITE]->(:Jobsite)-[:HAS_JOBPOST]->(jp:Jobpost)
        OPTIONAL MATCH (jp)-[:HAS_STRUCTURED_JOBPOST]->(j:StructuredJobpost)
        OPTIONAL MATCH (o)-[:HAS_FUNDING_ROUND]->(fr:FundingRound)
        OPTIONAL MATCH (o)-[:HAS_PROJECT]->(p:Project)
        OPTIONAL MATCH (j)-[:USES_TECHNOLOGY]->(t:Technology)
        WHERE NOT (t)<-[:IS_BLOCKED_TERM]-()
        AND (t)<-[:IS_PREFERRED_TERM_OF]-(:PreferredTerm)
        AND (t)<-[:IS_PAIRED_WITH]-(:TechnologyPairing)-[:IS_PAIRED_WITH]->(:Technology)
        WITH o.orgId as id, o.logoUrl as logo, o.name as name, o.location as location, o.headCount as headCount, COUNT(DISTINCT p) as projectCount, COUNT(DISTINCT j) as jobCount, COLLECT(DISTINCT t) as technologies, fr
        ORDER BY fr.date DESC
        WITH id, name, logo, location, headCount, projectCount, jobCount, technologies, collect(fr)[0] as mrfr
        WHERE id = $id
        RETURN { id: id, name: name, logo: logo, location: location, headCount: headCount, projectCount: projectCount, jobCount: jobCount, technologies: technologies, lastFundingAmount: mrfr.raisedAmount, lastFundingDate: mrfr.date } as res
        `,
        { id },
      )
      .then(res =>
        res.records[0]
          ? new ShortOrgEntity(res.records[0].get("res")).getProperties()
          : undefined,
      );
  }
}
