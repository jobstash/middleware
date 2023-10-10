import { Injectable } from "@nestjs/common";
import { TagPair, Tag, TagPreference } from "src/shared/types";
import { CustomLogger } from "src/shared/utils/custom-logger";
import * as Sentry from "@sentry/node";
import { ModelService } from "src/model/model.service";
import { CreateTagDto } from "./dto/create-tag.dto";
import { InjectConnection } from "nest-neogma";
import { Neogma } from "neogma";
import { UpdateTagDto } from "./dto/update-tag.dto";
import { TagEntity } from "src/shared/entities/tag.entity";
import NotFoundError from "src/shared/errors/not-found-error";
import { CreatePreferredTagDto } from "./dto/create-preferred-tag.dto";

@Injectable()
export class TagsService {
  private readonly logger = new CustomLogger(TagsService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private models: ModelService,
  ) {}

  async findAll(): Promise<Tag[]> {
    const res = await this.neogma.queryRunner.run(`
      MATCH (t:Tag)
      RETURN t
    `);

    return res.records.length
      ? res.records.map(resource => new Tag(resource.get("t")))
      : [];
  }

  async findById(id: string): Promise<TagEntity> {
    const res = await this.neogma.queryRunner.run(
      `
      MATCH (t:Tag {id: $id})
      RETURN t
      `,
      {
        id,
      },
    );

    return res.records.length ? new TagEntity(res.records[0].get("t")) : null;
  }

  async findByNormalizedName(
    normalizedName: string,
  ): Promise<TagEntity | null> {
    const res = await this.neogma.queryRunner.run(
      `
            MATCH (t:Tag {normalizedName: $normalizedName})
            RETURN t
        `,
      { normalizedName },
    );
    return res.records.length ? new TagEntity(res.records[0].get("t")) : null;
  }

  async findPreferredTagByNormalizedName(
    normalizedPreferredName: string,
  ): Promise<PreferredTagEntity | null> {
    const res = await this.neogma.queryRunner.run(
      `
              MATCH (pt:PreferredTag {normalizedName: $normalizedPreferredName})
              RETURN pt
          `,
      { normalizedPreferredName },
    );
    return res.records.length
      ? new PreferredTagEntity(res.records[0].get("pt"))
      : null;
  }

  async findBlockedTagNodeByName(
    name: string,
  ): Promise<BlockedTagEntity | null> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (bt:BlockedTag {name: $name})
        RETURN bt
      `,
      { name },
    );
    return res.records.length
      ? new BlockedTagEntity(res.records[0].get("bt"))
      : null;
  }

  async getAllUnblockedTags(): Promise<Tag[]> {
    try {
      return this.models.Tags.getAllowedTags();
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "tags.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`TagsService::getAll ${err.message}`);
      return undefined;
    }
  }

  async getBlockedTags(): Promise<Tag[]> {
    try {
      return this.models.Tags.getBlockedTags();
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "tags.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`TagsService::getBlockedTags ${err.message}`);
      return undefined;
    }
  }

  async getPreferredTags(): Promise<TagPreference[]> {
    try {
      return this.models.Tags.getPreferredTags();
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "tags.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`TagsService::getPreferredTags ${err.message}`);
      return undefined;
    }
  }

  async getPairedTags(): Promise<TagPair[]> {
    try {
      return this.models.Tags.getPairedTags();
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "tags.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`TagsService::getPairedTags ${err.message}`);
      return undefined;
    }
  }

  async create(dto: CreateTagDto): Promise<TagEntity> {
    return this.neogma.queryRunner
      .run(
        `
            CREATE (t:Tag { id: randomUUID() })
            SET t += $properties
            RETURN t
        `,
        {
          properties: {
            ...dto,
          },
        },
      )
      .then(res => new TagEntity(res.records[0].get("t")));
  }

  async createBlockedTagNode(name: string): Promise<BlockedTagEntity> {
    return this.neogma.queryRunner
      .run(
        `
              CREATE (bt:BlockedTag { id: randomUUID() })
              SET bt += $properties
              RETURN bt
          `,
        {
          properties: {
            name,
          },
        },
      )
      .then(res => new BlockedTagEntity(res.records[0].get("bt")));
  }

  async createPreferredTag(
    dto: CreatePreferredTagDto,
  ): Promise<PreferredTagEntity> {
    return this.neogma.queryRunner
      .run(
        `
              CREATE (pt:PreferredTag { id: randomUUID() })
              SET pt += $properties
              RETURN pt
          `,
        {
          properties: {
            ...dto,
          },
        },
      )
      .then(res => new PreferredTagEntity(res.records[0].get("pt")));
  }

  async hasBlockedNoRelationship(
    blockedTagNodeId: string,
    tagNodeId: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (bt:BlockedTag {id: $blockedTagNodeId})
        MATCH (t:Tag {id: $tagNodeId})
        WITH bt, t
        RETURN EXISTS( (bt)-[:HAS_TAG_DESIGNATION]->(t) ) AS result
        `,
      { blockedTagNodeId, tagNodeId },
    );

    return res.records[0]?.get("result") ?? false;
  }

  async hasPreferredNoRelationship(
    preferredTagNodeId: string,
    tagNodeId: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (pt:PreferredTag {id: $preferredTagNodeId})
        MATCH (t:Tag {id: $tagNodeId})
        WITH pt, t
        RETURN EXISTS( (pt)-[:IS_PREFERRED_TERM_OF]->(t) ) AS result
        `,
      { preferredTagNodeId, tagNodeId },
    );

    return res.records[0]?.get("result") ?? false;
  }

  async hasPreferredTagCreatorRelationship(
    preferredTagNodeId: string,
    wallet: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (pt:PreferredTag {id: $preferredTagNodeId})
        MATCH (u:User {wallet: $wallet})
        WITH pt, u
        RETURN EXISTS( (u)-[:CREATED_PREFERRED_TERM]->(pt) ) AS result
        `,
      { preferredTagNodeId, wallet },
    );

    return res.records[0]?.get("result") ?? false;
  }

  async hasBlockedTagCreatorRelationship(
    blockedTagNodeId: string,
    wallet: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (bt:BlockedTag {id: $blockedTagNodeId})
        MATCH (u:User {wallet: $wallet})
        WITH bt, u
        RETURN EXISTS( (u)-[:CREATED_BLOCKED_TERM]->(bt) ) AS result
        `,
      { blockedTagNodeId, wallet },
    );

    return res.records[0]?.get("result") ?? false;
  }

  async relatePreferredTagToTag(
    preferredTagNodeId: string,
    tagNodeId: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (pt:PreferredTag {id: $preferredTagNodeId})
        MATCH (t:Tag {id: $tagNodeId})

        MERGE (pt)-[r:IS_PREFERRED_TERM_OF]->(t)
        SET r.timestamp = timestamp()

        RETURN pt {
          .*,
          relationshipTimestamp: r.timestamp
        } AS result


        `,
      { preferredTagNodeId, tagNodeId },
    );

    return res.records[0].get("result");
  }

  async relatePairedTags(
    normalizedOriginTagNameNodeId: string,
    normalizedPairTagListNodesIds: string[],
    creatorWallet: string,
  ): Promise<boolean> {
    try {
      await this.neogma.queryRunner.run(
        `
          MATCH (t1:Tag {id: $normalizedOriginTagNameNodeId})

          OPTIONAL MATCH (t1)-[r:IS_PAIRED_WITH]->(t2)
          DETACH DELETE r1

          WITH t1
          
          UNWIND $normalizedPairTagListNodesIds AS pairTagNodeId
          MATCH (t2:Tag {id: pairTagNodeId})

          CREATE (t1)-[:IS_PAIRED_WITH]->(t2)
          SET tp.timestamp = timestamp()
          SET tp.creator = $creatorWallet
        `,
        {
          normalizedOriginTagNameNodeId,
          normalizedPairTagListNodesIds,
          creatorWallet,
        },
      );
      return true;
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "tags.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`TagsService::relatePairedTags ${err.message}`);
      return false;
    }
  }

  async relateBlockedTagToTag(
    blockedTagNodeId: string,
    tagNodeId: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (bt:BlockedTag {id: $blockedTagNodeId})
        MATCH (t:Tag {id: $tagNodeId})

        MERGE (bt)-[r:HAS_TAG_DESIGNATION]->(t)
        SET r.timestamp = timestamp()

        RETURN bt {
          .*,
          relationshipTimestamp: r.timestamp
        } AS result


        `,
      { blockedTagNodeId, tagNodeId },
    );

    return res.records[0].get("result");
  }

  async relatePreferredTagToCreator(
    preferredTagNodeId: string,
    wallet: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (pt:PreferredTag {id: $preferredTagNodeId})
        MATCH (u:User {wallet: $wallet})

        MERGE (pt)-[r:CREATED_PREFERRED_TERM_OF]->(u)
        SET r.timestamp = timestamp()

        RETURN  {
          .*,
          relationshipTimestamp: r.timestamp
        } AS result
        `,
      { preferredTagNodeId, wallet },
    );

    return res.records[0].get("result");
  }

  async relateBlockedTagToCreator(
    blockedTagNodeId: string,
    wallet: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (bt:BlockedTag {id: $blockedTagNodeId})
        MATCH (u:User {wallet: $wallet})

        MERGE (u)-[r:CREATED_BLOCKED_TERM]->(bt)
        SET r.timestamp = timestamp()

        RETURN bt {
          .*,
          relationshipTimestamp: r.timestamp
        } AS result
        `,
      { blockedTagNodeId, wallet },
    );

    return res.records[0].get("result");
  }

  async relateTagToStructuredJobpost(
    tagId: string,
    structuredJobpostId: string,
  ): Promise<Tag> {
    const tag = await this.neogma.queryRunner.run(
      `
            MATCH (t:Tag { id: $tagId })
            RETURN t
        `,
      { tagId },
    );
    if (!tag.records.length) {
      throw new NotFoundError("Tag not found");
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
          MATCH (t:Tag { id: $tagId })
          MATCH (sj:StructuredJobpost { id: $structuredJobpostId })
          
          MERGE (sj)-[r:HAS_TAG]->(t)
          
          SET r.timestamp = timestamp()
          SET r.originatingJobpostId = $structuredJobpostId

          RETURN t {
            .*,
            relationshipTimestamp: r.timestamp
          } AS Tag
      `,
      { tagId, structuredJobpostId },
    );

    if (res.records.length === 0) {
      throw new NotFoundError(
        `Could not create relationship between StructuredJobpost ${structuredJobpostId} to Tag ${tagId}`,
      );
    }

    const [first] = res.records;
    const tagData = first.get("Tag");
    return new Tag(tagData);
  }

  async relateTagToCreator(
    tagId: string,
    walletAddress: string,
  ): Promise<void> {
    const tag = await this.neogma.queryRunner.run(
      `
            MATCH (t:Tag { id: $tagId })
            RETURN t
        `,
      { tagId },
    );
    if (!tag.records.length) {
      throw new NotFoundError("Tag not found");
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
          MATCH (t:Tag { id: $tagId })
          MATCH (u:User { wallet: $walletAddress })
          MERGE (u)-[r:CREATED_TECHNOLOGY]->(t)
          SET r.timestamp = timestamp()

          RETURN t {
            .*,
            relationshipTimestamp: r.timestamp
          } AS Tag
      `,
      { tagId, walletAddress },
    );

    if (res.records.length === 0) {
      throw new NotFoundError(
        `Could not create relationship between User ${walletAddress} to Tag ${tagId}`,
      );
    }
  }

  async unrelatePreferredTagToTag(
    preferredTagNodeId: string,
    tagNodeId: string,
  ): Promise<void> {
    await this.neogma.queryRunner.run(
      `
      MATCH (pt:PreferredTag {id: $preferredTagNodeId})-[r:IS_PREFERRED_TERM_OF]-(t:Tag {id: $tagNodeId})

      DETACH DELETE r
      `,
      { preferredTagNodeId, tagNodeId },
    );

    return;
  }

  async unrelateBlockedTagFromTag(
    blockedTagNodeId: string,
    tagNodeId: string,
  ): Promise<boolean> {
    await this.neogma.queryRunner.run(
      `
        MATCH (bt:BlockedTag {id: $blockedTagNodeId})-[r:HAS_TAG_DESIGNATION]->(t:Tag {id: $tagNodeId})
        DETACH DELETE r
      `,
      { blockedTagNodeId, tagNodeId },
    );

    return;
  }

  async unrelateBlockedTagFromCreator(
    blockedTagNodeId: string,
    wallet: string,
  ): Promise<void> {
    await this.neogma.queryRunner.run(
      `
      MATCH (pt:BlockedTag {id: $blockedTagNodeId})-[r:CREATED_BLOCKED_TERM]-(u:User {wallet: $wallet})

      DETACH DELETE r
      `,
      { blockedTagNodeId, wallet },
    );

    return;
  }

  async unrelatePreferredTagFromCreator(
    preferredTagNodeId: string,
    wallet: string,
  ): Promise<void> {
    await this.neogma.queryRunner.run(
      `
      MATCH (pt:PreferredTag {id: $preferredTagNodeId})-[r:CREATED_PREFERRED_TERM_OF]-(u:User {wallet: $wallet})

      DETACH DELETE r
      `,
      { preferredTagNodeId, wallet },
    );

    return;
  }

  async linkSynonyms(
    firstTagNodeId: string,
    secondTagNodeId: string,
    synonymSuggesterWallet: string,
  ): Promise<Tag[]> {
    const res = await this.neogma.queryRunner.run(
      `
      MATCH (t1:Tag {id: $firstTagNodeId})
      MATCH (t2:Tag {id: $secondTagNodeId})
      MATCH (u:User {wallet: $synonymSuggesterWallet})
      
      MERGE (t1)-[:IS_SYNONYM_OF]->(t2)
      
      CREATE (u)-[:SUGGESTED]->(ts:TagSynonym)-[:FOR]->(t1)
      SET ts.timestamp = timestamp()
      SET ts.synonymNodeId = $secondTagNodeId

      RETURN t1, t2
      `,
      { firstTagNodeId, secondTagNodeId, synonymSuggesterWallet },
    );

    if (res.records.length === 0) {
      throw new NotFoundError(
        `Could not link synonym Tags ${firstTagNodeId} and ${secondTagNodeId}`,
      );
    }

    const [first, second] = res.records;
    const firstNode = new Tag(first.get("Tag"));
    const secondNode = new Tag(second.get("Tag"));

    return [firstNode, secondNode];
  }

  async unlinkSynonyms(
    firstTagNodeId: string,
    secondTagNodeId: string,
    creatorWallet: string,
  ): Promise<Tag[]> {
    await this.neogma.queryRunner.run(
      `
        MATCH (u:User {wallet: $userWallet})
        MATCH (t1:Tag {id: $firstTagNodeId})-[syn:IS_SYNONYM_OF]-(t2:Tag {id: $secondTagNodeId})

        CREATE (u)-[:DELETED]->(tds:TagDeletedSynonym)-[:FOR]->(t1)
        SET tds.synonymNodeId = $secondTagNodeId
        SET tds.timestamp = timestamp()

        DETACH DELETE syn
      `,
      { firstTagNodeId, secondTagNodeId, creatorWallet },
    );

    return;
  }

  async update(id: string, properties: UpdateTagDto): Promise<Tag> {
    return this.neogma.queryRunner
      .run(
        `
            MATCH (t:Tag { id: $id })
            SET t += $properties
            RETURN t
        `,
        { id, properties },
      )
      .then(res => new Tag(res.records[0].get("t")));
  }

  async deleteById(id: string): Promise<Tag> {
    const res = await this.neogma.queryRunner.run(
      `
      MATCH (t:Tag {id: $id})
      DETACH DELETE t
    `,
      {
        id,
      },
    );

    return res.records.length ? new Tag(res.records[0].get("t")) : null;
  }

  normalizeTagName(name: string): string {
    // Remove all spaces and punctuation from the name and lowercase the string
    if (!name) {
      throw new Error("Tag name is required");
    }
    return name.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  }
}
