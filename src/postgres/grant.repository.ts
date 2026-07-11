import { Injectable } from "@nestjs/common";
import { PostgresService } from "./postgres.service";

type NodeProperties = Record<string, unknown>;

const relatedNames = (
  sourceExpression: string,
  relationshipType: string,
): string => `
  COALESCE((
    SELECT jsonb_agg(DISTINCT target.properties ->> 'name')
      FILTER (WHERE target.properties ->> 'name' IS NOT NULL)
    FROM graph_relationships relationship
    JOIN graph_nodes target ON target.id = relationship.target_id
    WHERE relationship.source_id = ${sourceExpression}
      AND relationship.type = '${relationshipType}'
  ), '[]'::jsonb)
`;

const programPayload = `
  program.properties || jsonb_build_object(
    'status', (
      SELECT status.properties ->> 'name'
      FROM graph_relationships relationship
      JOIN graph_nodes status ON status.id = relationship.target_id
      WHERE relationship.source_id = program.id
        AND relationship.type = 'HAS_STATUS'
        AND status.label = 'KarmaGapStatus'
      ORDER BY status.id
      LIMIT 1
    ),
    'eligibility', (
      SELECT eligibility.properties || jsonb_build_object(
        'requirements', COALESCE((
          SELECT jsonb_agg(DISTINCT requirement.properties ->> 'description')
            FILTER (
              WHERE requirement.properties ->> 'description' IS NOT NULL
            )
          FROM graph_relationships requirement_relationship
          JOIN graph_nodes requirement
            ON requirement.id = requirement_relationship.target_id
          WHERE requirement_relationship.source_id = eligibility.id
            AND requirement_relationship.type = 'HAS_REQUIREMENT'
        ), '[]'::jsonb)
      )
      FROM graph_relationships relationship
      JOIN graph_nodes eligibility ON eligibility.id = relationship.target_id
      WHERE relationship.source_id = program.id
        AND relationship.type = 'HAS_ELIGIBILITY'
        AND eligibility.label = 'KarmaGapEligibility'
      ORDER BY eligibility.id
      LIMIT 1
    ),
    'socialLinks', (
      SELECT socials.properties
      FROM graph_relationships relationship
      JOIN graph_nodes socials ON socials.id = relationship.target_id
      WHERE relationship.source_id = program.id
        AND relationship.type = 'HAS_SOCIAL_LINKS'
        AND socials.label = 'KarmaGapSocials'
      ORDER BY socials.id
      LIMIT 1
    ),
    'quadraticFundingConfig', (
      SELECT config.properties
      FROM graph_relationships relationship
      JOIN graph_nodes config ON config.id = relationship.target_id
      WHERE relationship.source_id = program.id
        AND relationship.type = 'HAS_QUADRATIC_FUNDING_CONFIG'
        AND config.label = 'KarmaGapQuadraticFundingConfig'
      ORDER BY config.id
      LIMIT 1
    ),
    'support', (
      SELECT support.properties
      FROM graph_relationships relationship
      JOIN graph_nodes support ON support.id = relationship.target_id
      WHERE relationship.source_id = program.id
        AND relationship.type = 'HAS_SUPPORT'
        AND support.label = 'KarmaGapSupport'
      ORDER BY support.id
      LIMIT 1
    ),
    'metadata', (
      SELECT metadata.properties || jsonb_build_object(
        'categories', ${relatedNames("metadata.id", "HAS_CATEGORY")},
        'ecosystems', ${relatedNames("metadata.id", "HAS_ECOSYSTEM")},
        'organizations', ${relatedNames("metadata.id", "HAS_ORGANIZATION")},
        'networks', ${relatedNames("metadata.id", "HAS_NETWORKS")},
        'grantTypes', ${relatedNames("metadata.id", "HAS_GRANT_TYPE")},
        'tags', ${relatedNames("metadata.id", "HAS_TAG")},
        'platformsUsed', ${relatedNames("metadata.id", "HAS_PLATFORM_USED")}
      )
      FROM graph_relationships relationship
      JOIN graph_nodes metadata ON metadata.id = relationship.target_id
      WHERE relationship.source_id = program.id
        AND relationship.type = 'HAS_METADATA'
        AND metadata.label = 'KarmaGapProgramMetadata'
      ORDER BY metadata.id
      LIMIT 1
    )
  )
`;

@Injectable()
export class GrantRepository {
  constructor(private readonly postgres: PostgresService) {}

  async getPrograms(slug?: string): Promise<NodeProperties[]> {
    const rows = await this.postgres.query<{ program: NodeProperties }>(
      `
        SELECT ${programPayload} AS program
        FROM graph_nodes program
        WHERE program.label = 'KarmaGapProgram'
          ${slug ? "AND program.properties ->> 'slug' = $1" : ""}
        ORDER BY program.properties ->> 'name',
          program.properties ->> 'programId', program.id
      `,
      slug ? [slug] : [],
    );
    return rows.map(row => row.program);
  }

  async getGrantees(
    programSlug: string,
    granteeSlug?: string,
  ): Promise<NodeProperties[]> {
    const parameters: unknown[] = [programSlug];
    const granteePredicate = granteeSlug
      ? "AND project.properties ->> 'normalizedName' = $2"
      : "";
    if (granteeSlug) parameters.push(granteeSlug);
    const rows = await this.postgres.query<{ project: NodeProperties }>(
      `
        SELECT project.properties || jsonb_build_object(
          'website', (
            SELECT website.properties -> 'url'
            FROM graph_relationships relationship
            JOIN graph_nodes website ON website.id = relationship.target_id
            WHERE relationship.source_id = project.id
              AND relationship.type = 'HAS_WEBSITE'
              AND website.label = 'Website'
            ORDER BY website.id
            LIMIT 1
          ),
          'grantFundingData', COALESCE((
            SELECT jsonb_agg(
              funding.properties || jsonb_build_object(
                'programName', (
                  SELECT program.properties -> 'name'
                  FROM graph_relationships funding_program
                  JOIN graph_nodes program
                    ON program.id = funding_program.target_id
                  WHERE funding_program.source_id = funding.id
                    AND funding_program.type = 'FUNDED_BY'
                  ORDER BY program.id
                  LIMIT 1
                )
              ) ORDER BY COALESCE(
                jsonb_numeric_value(funding.properties, 'fundingDate'), 0
              ) DESC, funding.id
            )
            FROM graph_relationships project_funding
            JOIN graph_nodes funding ON funding.id = project_funding.target_id
            WHERE project_funding.source_id = project.id
              AND project_funding.type = 'HAS_GRANT_FUNDING'
              AND funding.label = 'GrantFunding'
          ), '[]'::jsonb),
          'vcFundingData', COALESCE((
            SELECT jsonb_agg(DISTINCT funding_round.properties)
            FROM graph_relationships organization_project
            JOIN graph_nodes organization
              ON organization.id = organization_project.source_id
             AND organization.label = 'Organization'
            JOIN graph_relationships organization_funding
              ON organization_funding.source_id = organization.id
             AND organization_funding.type = 'HAS_FUNDING_ROUND'
            JOIN graph_nodes funding_round
              ON funding_round.id = organization_funding.target_id
             AND funding_round.label = 'FundingRound'
            WHERE organization_project.target_id = project.id
              AND organization_project.type = 'HAS_PROJECT'
              AND funding_round.properties ->> 'id' IS NOT NULL
          ), '[]'::jsonb)
        ) AS project
        FROM graph_nodes project
        WHERE project.label = 'Project'
          ${granteePredicate}
          AND EXISTS (
            SELECT 1
            FROM graph_relationships project_funding
            JOIN graph_nodes funding
              ON funding.id = project_funding.target_id
             AND funding.label = 'GrantFunding'
            JOIN graph_relationships funding_program
              ON funding_program.source_id = funding.id
             AND funding_program.type = 'FUNDED_BY'
            JOIN graph_nodes program
              ON program.id = funding_program.target_id
             AND program.label = 'KarmaGapProgram'
            WHERE project_funding.source_id = project.id
              AND project_funding.type = 'HAS_GRANT_FUNDING'
              AND program.properties ->> 'slug' = $1
          )
        ORDER BY project.properties ->> 'name', project.id
      `,
      parameters,
    );
    return rows.map(row => row.project);
  }

  async searchProgramIds(embedding: number[], limit = 10): Promise<string[]> {
    if (embedding.length !== 1536) {
      throw new Error(
        `Grant search requires a 1536-dimensional embedding, received ${embedding.length}`,
      );
    }
    const vector = `[${embedding
      .map(value => (Number.isFinite(value) ? value : 0))
      .join(",")}]`;
    const rows = await this.postgres.query<{ programId: string }>(
      `
        SELECT program_id AS "programId"
        FROM grant_chunk_embeddings
        ORDER BY embedding <=> $1::halfvec(1536), chunk_node_id
        LIMIT $2
      `,
      [vector, limit],
    );
    return rows.map(row => row.programId);
  }
}
