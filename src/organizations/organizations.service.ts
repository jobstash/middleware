import { Injectable } from "@nestjs/common";
import { Neo4jService } from "nest-neo4j/dist";
import { ShortOrgEntity } from "src/shared/entities/organization.entity";
import { ShortOrg } from "src/shared/interfaces";

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
        WITH o.orgId as id, o.logoUrl as logo, o.name as name, o.location as location, o.headCount as headCount, COUNT(DISTINCT p) as projectCount, COUNT(DISTINCT j) as jobCount, COLLECT(DISTINCT t) as technologies, fr
        ORDER BY fr.date DESC
        WITH id, name, logo, location, headCount, projectCount, jobCount, technologies, collect(fr)[0] as mrfr
        WHERE name CONTAINS $query
        RETURN { id: id, name: name, logo: logo, location: location, headCount: headCount, projectCount: projectCount, jobCount: jobCount, technologies: technologies, lastFundingAmount: mrfr.raisedAmount, lastFundingDate: mrfr.date } as res
        `,
        { query },
      )
      .then(res =>
        res.records.map(record => {
          const ent = new ShortOrgEntity(record.get("res")).getProperties();
          return ent;
        }),
      );
  }
}
