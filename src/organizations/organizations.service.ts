import { Injectable } from "@nestjs/common";
import { Neo4jService } from "nest-neo4j/dist";
import {
  ShortOrgEntity,
  ShortOrg,
  Repository as RepositoryProperties,
} from "src/shared/types";
import { Repository } from "src/shared/entities/repository.entity";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";

@Injectable()
export class OrganizationsService {
  logger = new CustomLogger(OrganizationsService.name);
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
      )
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "organizations.service",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`OrganizationsService::getAll ${err.message}`);
        return undefined;
      });
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
        WITH o, COUNT(DISTINCT p) as projectCount, COUNT(DISTINCT j) as jobCount, COLLECT(DISTINCT t) as technologies, fr
        ORDER BY fr.date DESC
        WITH o, projectCount, jobCount, technologies, COLLECT(fr)[0] as mrfr, COLLECT(fr) as fundingRounds
        WHERE o.name =~ $query
        RETURN { id: o.orgId, name: o.name, logo: o.logo, location: o.location, headCount: o.headCount, projectCount: projectCount, jobCount: jobCount, technologies: technologies, lastFundingAmount: mrfr.raisedAmount, lastFundingDate: mrfr.date, url: o.url, description: o.description, github: o.github, twitter: o.twitter, telegram: o.telegram, discord: o.discord, fundingRounds: fundingRounds } as res
        `,
        { query: `(?i).*${query}.*` },
      )
      .then(res =>
        res.records.map(record =>
          new ShortOrgEntity(record.get("res")).getProperties(),
        ),
      )
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "organizations.service",
          });
          scope.setExtra("input", query);
          Sentry.captureException(err);
        });
        this.logger.error(
          `OrganizationsService::searchOrganizations ${err.message}`,
        );
        return undefined;
      });
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
        WITH o, COUNT(DISTINCT p) as projectCount, COUNT(DISTINCT j) as jobCount, COLLECT(DISTINCT t) as technologies, fr
        ORDER BY fr.date DESC
        WITH o, projectCount, jobCount, technologies, COLLECT(fr)[0] as mrfr, COLLECT(fr) as fundingRounds
        WHERE o.orgId = $id
        RETURN { id: o.orgId, name: o.name, logo: o.logo, location: o.location, headCount: o.headCount, projectCount: projectCount, jobCount: jobCount, technologies: technologies, lastFundingAmount: mrfr.raisedAmount, lastFundingDate: mrfr.date, url: o.url, description: o.description, github: o.github, twitter: o.twitter, telegram: o.telegram, discord: o.discord, fundingRounds: fundingRounds } as res
        `,
        { id },
      )
      .then(res =>
        res.records[0]
          ? new ShortOrgEntity(res.records[0].get("res")).getProperties()
          : undefined,
      )
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "organizations.service",
          });
          scope.setExtra("input", id);
          Sentry.captureException(err);
        });
        this.logger.error(`OrganizationsService::getOrgById ${err.message}`);
        return undefined;
      });
  }

  async getRepositories(id: string): Promise<RepositoryProperties[]> {
    return this.neo4jService
      .read(
        `
        MATCH (:Organization {orgId: $id})-[:HAS_REPOSITORY]->(r:Repository)
        RETURN r as res
        `,
        { id },
      )
      .then(res =>
        res.records.map(record => {
          const ent = new Repository(record.get("res")).getProperties();
          return ent;
        }),
      )
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "organizations.service",
          });
          scope.setExtra("input", id);
          Sentry.captureException(err);
        });
        this.logger.error(
          `OrganizationsService::getRepositories ${err.message}`,
        );
        return undefined;
      });
  }
}
