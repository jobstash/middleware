import { Injectable } from "@nestjs/common";
import { TechnologyPreferredTerm } from "src/shared/interfaces/technology-preferred-term.interface";
import {
  PairedTerm,
  Technology,
  TechnologyBlockedTermEntity,
  TechnologyPreferredTermEntity,
} from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { ModelService } from "src/model/model.service";
import { CreateTechnologyDto } from "./dto/create-technology.dto";
import { InjectConnection } from "nest-neogma";
import { Neogma } from "neogma";
import { UpdateTechnologyDto } from "./dto/update-technology.dto";
import { TechnologyEntity } from "src/shared/entities/technology.entity";
import NotFoundError from "src/shared/errors/not-found-error";
import { CreateTechnologyPreferredTermDto } from "./dto/create-technology-preferred-term.dto";

@Injectable()
export class TechnologiesService {
  private readonly logger = new CustomLogger(TechnologiesService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private models: ModelService,
  ) {}

  async findAll(): Promise<Technology[]> {
    const res = await this.neogma.queryRunner.run(`
      MATCH (t:Technology)
      RETURN t
    `);

    return res.records.length
      ? res.records.map(resource => new Technology(resource.get("t")))
      : [];
  }

  async findById(id: string): Promise<TechnologyEntity> {
    const res = await this.neogma.queryRunner.run(
      `
      MATCH (t:Technology {id: $id})
      RETURN t
      `,
      {
        id,
      },
    );

    return res.records.length
      ? new TechnologyEntity(res.records[0].get("t"))
      : null;
  }

  async findByNormalizedName(
    normalizedName: string,
  ): Promise<TechnologyEntity | null> {
    const res = await this.neogma.queryRunner.run(
      `
            MATCH (t:Technology {normalizedName: $normalizedName})
            RETURN t
        `,
      { normalizedName },
    );
    return res.records.length
      ? new TechnologyEntity(res.records[0].get("t"))
      : null;
  }

  async findPreferredTermByNormalizedName(
    normalizedPreferredName: string,
  ): Promise<TechnologyPreferredTermEntity | null> {
    const res = await this.neogma.queryRunner.run(
      `
              MATCH (pt:PreferredTerm {normalizedName: $normalizedPreferredName})
              RETURN pt
          `,
      { normalizedPreferredName },
    );
    return res.records.length
      ? new TechnologyPreferredTermEntity(res.records[0].get("pt"))
      : null;
  }

  async findBlockedTermNodeByName(
    name: string,
  ): Promise<TechnologyBlockedTermEntity | null> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (bt:TechnologyBlockedTerm {name: $name})
        RETURN bt
      `,
      { name },
    );
    return res.records.length
      ? new TechnologyBlockedTermEntity(res.records[0].get("bt"))
      : null;
  }

  async getAllUnblockedTerms(): Promise<Technology[]> {
    try {
      return this.models.Technologies.getAllowedTerms();
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "technologies.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`TechnologiesService::getAll ${err.message}`);
      return undefined;
    }
  }

  async getBlockedTerms(): Promise<Technology[]> {
    try {
      return this.models.Technologies.getBlockedTerms();
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "technologies.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`TechnologiesService::getBlockedTerms ${err.message}`);
      return undefined;
    }
  }

  async getPreferredTerms(): Promise<TechnologyPreferredTerm[]> {
    try {
      return this.models.Technologies.getPreferredTerms();
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "technologies.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(
        `TechnologiesService::getPreferredTerms ${err.message}`,
      );
      return undefined;
    }
  }

  async getPairedTerms(): Promise<PairedTerm[]> {
    try {
      return this.models.Technologies.getPairedTerms();
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "technologies.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`TechnologiesService::getPairedTerms ${err.message}`);
      return undefined;
    }
  }

  async create(dto: CreateTechnologyDto): Promise<TechnologyEntity> {
    return this.neogma.queryRunner
      .run(
        `
            CREATE (t:Technology { id: randomUUID() })
            SET t += $properties
            RETURN t
        `,
        {
          properties: {
            ...dto,
          },
        },
      )
      .then(res => new TechnologyEntity(res.records[0].get("t")));
  }

  async createBlockedTermNode(
    name: string,
  ): Promise<TechnologyBlockedTermEntity> {
    return this.neogma.queryRunner
      .run(
        `
              CREATE (bt:TechnologyBlockedTerm { id: randomUUID() })
              SET bt += $properties
              RETURN bt
          `,
        {
          properties: {
            name,
          },
        },
      )
      .then(res => new TechnologyBlockedTermEntity(res.records[0].get("bt")));
  }

  async createTechnologyPreferredTerm(
    dto: CreateTechnologyPreferredTermDto,
  ): Promise<TechnologyPreferredTermEntity> {
    return this.neogma.queryRunner
      .run(
        `
              CREATE (pt:PreferredTerm { id: randomUUID() })
              SET pt += $properties
              RETURN pt
          `,
        {
          properties: {
            ...dto,
          },
        },
      )
      .then(res => new TechnologyPreferredTermEntity(res.records[0].get("pt")));
  }

  async hasBlockedTermRelationship(
    blockedTermNodeId: string,
    technologyNodeId: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (bt:TechnologyBlockedTerm {id: $blockedTermNodeId})
        MATCH (t:Technology {id: $technologyNodeId})
        WITH bt, t
        RETURN EXISTS( (bt)-[:IS_BLOCKED_TERM]->(t) ) AS result
        `,
      { blockedTermNodeId, technologyNodeId },
    );

    return res.records[0]?.get("result") ?? false;
  }

  async hasPreferredTermRelationship(
    preferredTermNodeId: string,
    technologyNodeId: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (pt:PreferredTerm {id: $preferredTermNodeId})
        MATCH (t:Technology {id: $technologyNodeId})
        WITH pt, t
        RETURN EXISTS( (pt)-[:IS_PREFERRED_TERM_OF]->(t) ) AS result
        `,
      { preferredTermNodeId, technologyNodeId },
    );

    return res.records[0]?.get("result") ?? false;
  }

  async hasPreferredTermCreatorRelationship(
    preferredTermNodeId: string,
    wallet: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (pt:PreferredTerm {id: $preferredTermNodeId})
        MATCH (u:User {wallet: $wallet})
        WITH pt, u
        RETURN EXISTS( (u)-[:CREATED_PREFERRED_TERM]->(pt) ) AS result
        `,
      { preferredTermNodeId, wallet },
    );

    return res.records[0]?.get("result") ?? false;
  }

  async hasBlockedTermCreatorRelationship(
    blockedTermNodeId: string,
    wallet: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (bt:TechnologyBlockedTerm {id: $blockedTermNodeId})
        MATCH (u:User {wallet: $wallet})
        WITH bt, u
        RETURN EXISTS( (u)-[:CREATED_BLOCKED_TERM]->(bt) ) AS result
        `,
      { blockedTermNodeId, wallet },
    );

    return res.records[0]?.get("result") ?? false;
  }

  async relatePreferredTermToTechnologyTerm(
    preferredTermNodeId: string,
    technologyNodeId: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (pt:PreferredTerm {id: $preferredTermNodeId})
        MATCH (t:Technology {id: $technologyNodeId})

        MERGE (pt)-[r:IS_PREFERRED_TERM_OF]->(t)
        SET r.timestamp = timestamp()

        RETURN pt {
          .*,
          relationshipTimestamp: r.timestamp
        } AS result


        `,
      { preferredTermNodeId, technologyNodeId },
    );

    return res.records[0].get("result");
  }

  async relatePairedTerms(
    normalizedOriginTermNameNodeId: string,
    normalizedPairTermListNodesIds: string[],
    creatorWallet: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
    MATCH (t1:Technology {id: $normalizedOriginTermNameNodeId})
    MATCH (u:User {wallet: $creatorWallet})
    UNWIND $normalizedPairTermListNodesIds AS pairTermNodeId
    MATCH (t2:Technology {id: pairTermNodeId})

    CREATE (t1)-[:IS_PAIRED_WITH]->(tp:TechnologyPairing)-[:IS_PAIRED_WITH]->(t2)
    SET tp.timestamp = timestamp()

    CREATE (u)-[:CREATED_PAIRING]->(tp)
  `,
      {
        normalizedOriginTermNameNodeId,
        normalizedPairTermListNodesIds,
        creatorWallet,
      },
    );

    return res.records[0].get("result");
  }

  async relateBlockedTermToTechnologyTerm(
    blockedTermNodeId: string,
    technologyNodeId: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (bt:TechnologyBlockedTerm {id: $blockedTermNodeId})
        MATCH (t:Technology {id: $technologyNodeId})

        MERGE (bt)-[r:IS_BLOCKED_TERM]->(t)
        SET r.timestamp = timestamp()

        RETURN bt {
          .*,
          relationshipTimestamp: r.timestamp
        } AS result


        `,
      { blockedTermNodeId, technologyNodeId },
    );

    return res.records[0].get("result");
  }

  async relateTechnologyPreferredTermToCreator(
    preferredTermNodeId: string,
    wallet: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (pt:PreferredTerm {id: $preferredTermNodeId})
        MATCH (u:User {wallet: $wallet})

        MERGE (pt)-[r:CREATED_PREFERRED_TERM_OF]->(u)
        SET r.timestamp = timestamp()

        RETURN  {
          .*,
          relationshipTimestamp: r.timestamp
        } AS result
        `,
      { preferredTermNodeId, wallet },
    );

    return res.records[0].get("result");
  }

  async relateTechnologyBlockedTermToCreator(
    blockedTermNodeId: string,
    wallet: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (bt:TechnologyBlockedTerm {id: $blockedTermNodeId})
        MATCH (u:User {wallet: $wallet})

        MERGE (u)-[r:CREATED_BLOCKED_TERM]->(bt)
        SET r.timestamp = timestamp()

        RETURN bt {
          .*,
          relationshipTimestamp: r.timestamp
        } AS result
        `,
      { blockedTermNodeId, wallet },
    );

    return res.records[0].get("result");
  }

  async relateTechnologyToStructuredJobpost(
    technologyId: string,
    structuredJobpostId: string,
  ): Promise<Technology> {
    const technology = await this.neogma.queryRunner.run(
      `
            MATCH (t:Technology { id: $technologyId })
            RETURN t
        `,
      { technologyId },
    );
    if (!technology.records.length) {
      throw new NotFoundError("Technology not found");
    }
    const structuredJobpost = await this.neogma.queryRunner.run(
      `
            MATCH (sj:StructuredJobpost { id: $structuredJobpostId })
            RETURN sj
        `,
      { structuredJobpostId },
    );
    if (!structuredJobpost.records.length) {
      throw new NotFoundError("StructuredJobpost not found");
    }
    const res = await this.neogma.queryRunner.run(
      `
          MATCH (t:Technology { id: $technologyId })
          MATCH (sj:StructuredJobpost { id: $structuredJobpostId })
          
          MERGE (sj)-[r:USES_TECHNOLOGY]->(t)
          
          SET r.timestamp = timestamp()
          SET r.originatingJobpostId = $structuredJobpostId

          RETURN t {
            .*,
            relationshipTimestamp: r.timestamp
          } AS Technology
      `,
      { technologyId, structuredJobpostId },
    );

    if (res.records.length === 0) {
      throw new NotFoundError(
        `Could not create relationship between StructuredJobpost ${structuredJobpostId} to Technology ${technologyId}`,
      );
    }

    const [first] = res.records;
    const technologyData = first.get("Technology");
    return new Technology(technologyData);
  }

  async relateTechnologyToCreator(
    technologyId: string,
    walletAddress: string,
  ): Promise<void> {
    const technology = await this.neogma.queryRunner.run(
      `
            MATCH (t:Technology { id: $technologyId })
            RETURN t
        `,
      { technologyId },
    );
    if (!technology.records.length) {
      throw new NotFoundError("Technology not found");
    }
    const user = await this.neogma.queryRunner.run(
      `
            MATCH (u:User { wallet: $walletAddress })
            RETURN u
        `,
      { walletAddress },
    );
    if (!user.records.length) {
      throw new NotFoundError("User not found");
    }

    const res = await this.neogma.queryRunner.run(
      `
          MATCH (t:Technology { id: $technologyId })
          MATCH (u:User { wallet: $walletAddress })
          MERGE (u)-[r:CREATED_TECHNOLOGY]->(t)
          SET r.timestamp = timestamp()

          RETURN t {
            .*,
            relationshipTimestamp: r.timestamp
          } AS Technology
      `,
      { technologyId, walletAddress },
    );

    if (res.records.length === 0) {
      throw new NotFoundError(
        `Could not create relationship between User ${walletAddress} to Technology ${technologyId}`,
      );
    }
  }

  async unrelatePreferredTermToTechnologyTerm(
    preferredTermNodeId: string,
    technologyNodeId: string,
  ): Promise<void> {
    await this.neogma.queryRunner.run(
      `
      MATCH (pt:PreferredTerm {id: $preferredTermNodeId})-[r:IS_PREFERRED_TERM_OF]-(t:Technology {id: $technologyNodeId})

      DETACH DELETE r
      `,
      { preferredTermNodeId, technologyNodeId },
    );

    return;
  }

  async unrelateBlockedTermFromTechnologyTerm(
    blockedTermNodeId: string,
    technologyNodeId: string,
  ): Promise<boolean> {
    await this.neogma.queryRunner.run(
      `
        MATCH (bt:TechnologyBlockedTerm {id: $blockedTermNodeId})-[r:IS_BLOCKED_TERM]->(t:Technology {id: $technologyNodeId})
        DETACH DELETE r
      `,
      { blockedTermNodeId, technologyNodeId },
    );

    return;
  }

  async unrelateTechnologyBlockedTermFromCreator(
    blockedTermNodeId: string,
    wallet: string,
  ): Promise<void> {
    await this.neogma.queryRunner.run(
      `
      MATCH (pt:TechnologyBlockedTerm {id: $blockedTermNodeId})-[r:CREATED_BLOCKED_TERM]-(u:User {wallet: $wallet})

      DETACH DELETE r
      `,
      { blockedTermNodeId, wallet },
    );

    return;
  }

  async unrelateTechnologyPreferredTermFromCreator(
    preferredTermNodeId: string,
    wallet: string,
  ): Promise<void> {
    await this.neogma.queryRunner.run(
      `
      MATCH (pt:PreferredTerm {id: $preferredTermNodeId})-[r:CREATED_PREFERRED_TERM_OF]-(u:User {wallet: $wallet})

      DETACH DELETE r
      `,
      { preferredTermNodeId, wallet },
    );

    return;
  }

  async linkSynonyms(
    firstTermNodeId: string,
    secondTermNodeId: string,
    synonymSuggesterWallet: string,
  ): Promise<Technology[]> {
    const res = await this.neogma.queryRunner.run(
      `
      MATCH (t1:Technology {id: $firstTermNodeId})
      MATCH (t2:Technology {id: $secondTermNodeId})
      MATCH (u:User {wallet: $synonymSuggesterWallet})
      
      MERGE (t1)-[:IS_SYNONYM_OF]->(t2)
      
      CREATE (u)-[:SUGGESTED]->(ts:TechnologySynonym)-[:FOR]->(t1)
      SET ts.timestamp = timestamp()
      SET ts.synonymNodeId = $secondTermNodeId

      RETURN t1, t2
      `,
      { firstTermNodeId, secondTermNodeId, synonymSuggesterWallet },
    );

    if (res.records.length === 0) {
      throw new NotFoundError(
        `Could not link synonym Technologies ${firstTermNodeId} and ${secondTermNodeId}`,
      );
    }

    const [first, second] = res.records;
    const firstNode = new Technology(first.get("Technology"));
    const secondNode = new Technology(second.get("Technology"));

    return [firstNode, secondNode];
  }

  async unlinkSynonyms(
    firstTermNodeId: string,
    secondTermNodeId: string,
    creatorWallet: string,
  ): Promise<Technology[]> {
    await this.neogma.queryRunner.run(
      `
        MATCH (u:User {wallet: $userWallet})
        MATCH (t1:Technology {id: $firstTermNodeId})-[syn:IS_SYNONYM_OF]-(t2:Technology {id: $secondTermNodeId})

        CREATE (u)-[:DELETED]->(tds:TechnologyDeletedSynonym)-[:FOR]->(t1)
        SET tds.synonymNodeId = $secondTermNodeId
        SET tds.timestamp = timestamp()

        DETACH DELETE syn
      `,
      { firstTermNodeId, secondTermNodeId, creatorWallet },
    );

    return;
  }

  async update(
    id: string,
    properties: UpdateTechnologyDto,
  ): Promise<Technology> {
    return this.neogma.queryRunner
      .run(
        `
            MATCH (t:Technology { id: $id })
            SET t += $properties
            RETURN t
        `,
        { id, properties },
      )
      .then(res => new Technology(res.records[0].get("t")));
  }

  async deleteById(id: string): Promise<Technology> {
    const res = await this.neogma.queryRunner.run(
      `
      MATCH (t:Technology {id: $id})
      DETACH DELETE t
    `,
      {
        id,
      },
    );

    return res.records.length ? new Technology(res.records[0].get("t")) : null;
  }

  normalizeTechnologyName(name: string): string {
    // Remove all spaces and punctuation from the name and lowercase the string
    if (!name) {
      throw new Error("Technology name is required");
    }
    return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  }
}
