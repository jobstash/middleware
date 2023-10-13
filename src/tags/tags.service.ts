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
  ): Promise<TagPreference | null> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (pt:Tag {normalizedName: $normalizedPreferredName})-[:HAS_TAG_DESIGNATION]->(:Preferred)
        RETURN {
          tag: pt { .* },
          synonyms: [(tag)<-[:IS_SYNONYM_OF]-(synonym: Tag) | synonym { .* }]
        } as res
      `,
      { normalizedPreferredName },
    );
    return res.records.length
      ? new TagPreference(res.records[0].get("res"))
      : null;
  }

  async findBlockedTagByName(name: string): Promise<TagEntity | null> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (bt:Tag {name: $name})-[:HAS_TAG_DESIGNATION]->(:Blocked)
        RETURN bt
      `,
      { name },
    );
    return res.records.length ? new TagEntity(res.records[0].get("bt")) : null;
  }

  async getAllUnblockedTags(): Promise<Tag[]> {
    try {
      return this.models.Tags.getUnblockedTags();
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

  async create(dto: CreateTagDto, creatorWallet: string): Promise<TagEntity> {
    return this.neogma.queryRunner
      .run(
        `
          CREATE (t:Tag { id: randomUUID() })-[r:HAS_TAG_DESIGNATION]->(:Allowed)
          SET t += $properties
          SET r.creator = $creatorWallet
          SET r.timestamp = timestamp()
          RETURN t
        `,
        {
          properties: {
            ...dto,
          },
          creatorWallet,
        },
      )
      .then(res => new TagEntity(res.records[0].get("t")));
  }

  async blockTag(name: string, creatorWallet: string): Promise<TagEntity> {
    return this.neogma.queryRunner
      .run(
        `
          MATCH (:Tag {name: $name})-[r:HAS_TAG_DESIGNATION]->(:Allowed|Default)
          DETACH DELETE r

          CREATE (bt:Tag {name: $name})-[r:HAS_TAG_DESIGNATION]->(:Blocked)
          SET r.creator = $creatorWallet
          SET r.timestamp = timestamp()
          RETURN bt
          `,
        {
          properties: {
            name,
            creatorWallet,
          },
        },
      )
      .then(res => new TagEntity(res.records[0].get("bt")));
  }

  async preferTag(name: string, creatorWallet: string): Promise<TagEntity> {
    return this.neogma.queryRunner
      .run(
        `
          CREATE (pt:Tag {name: $name})-[r:HAS_TAG_DESIGNATION]->(:Preferred)
          SET r.creator = $creatorWallet
          SET r.timestamp = timestamp()
          RETURN pt
          `,
        {
          name,
          creatorWallet,
        },
      )
      .then(res => new TagEntity(res.records[0].get("pt")));
  }

  async hasBlockedRelation(tagNodeId: string): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        RETURN EXISTS( (t:Tag {id: $tagNodeId})-[:HAS_TAG_DESIGNATION]->(:Blocked) ) AS result
        `,
      { tagNodeId },
    );

    return res.records[0]?.get("result") ?? false;
  }

  async hasPreferredRelation(tagNodeId: string): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        RETURN EXISTS( (t:Tag {id: $tagNodeId})-[:HAS_TAG_DESIGNATION]->(:Preferred) ) AS result
        `,
      { tagNodeId },
    );

    return res.records[0]?.get("result") ?? false;
  }

  async hasRelationToPreferredTag(
    preferredNodeId: string,
    synonymNodeId: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (t:Tag {id: $preferredNodeId})-[:HAS_TAG_DESIGNATION]->(:Preferred)
        RETURN EXISTS( (t)<-[:IS_SYNONYM_OF]-(:Tag {id: $synonymNodeId}) ) AS result
        `,
      { preferredNodeId, synonymNodeId },
    );

    return res.records[0]?.get("result") ?? false;
  }

  async hasPreferredTagCreatorRelationship(
    preferredTagNodeId: string,
    wallet: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (:Tag {id: $preferredTagNodeId})-[r:HAS_TAG_DESIGNATION]->(:Preferred)
        RETURN r.creator = $wallet AS result
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
        MATCH (:Tag {id: $blockedTagNodeId})-[r:HAS_TAG_DESIGNATION]->(:Blocked)
        RETURN r.creator = $wallet AS result
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
        MATCH (pt:Tag {id: $preferredTagNodeId})-[r:HAS_TAG_DESIGNATION]->(:Preferred)
        MATCH (t:Tag {id: $tagNodeId})

        CREATE (pt)<-[r:IS_SYNONYM_OF]-(t)
        SET r.timestamp = timestamp()

        RETURN true as result;


        `,
      { preferredTagNodeId, tagNodeId },
    );

    return res.records[0].get("result") as boolean;
  }

  async relatePairedTags(
    normalizedOriginTagNameNodeId: string,
    normalizedPairTagListNodesIds: string[],
    creatorWallet: string,
  ): Promise<boolean> {
    try {
      await this.neogma.queryRunner.run(
        `
          MATCH (t1:Tag {id: $normalizedOriginTagNameNodeId})-[:HAS_TAG_DESIGNATION]->(:Paired)

          OPTIONAL MATCH (t1)-[r:IS_PAIR_OF]->(t2)
          DETACH DELETE r

          WITH t1
          
          UNWIND $normalizedPairTagListNodesIds AS pairTagNodeId
          MATCH (t2:Tag {id: pairTagNodeId})

          CREATE (t1)-[p:IS_PAIR_OF]->(t2)
          SET p.timestamp = timestamp()
          SET p.creator = $creatorWallet
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
          
          CREATE (sj)-[r:HAS_TAG]->(t)
          
          SET r.timestamp = timestamp()
          SET r.originatingJobpostId = $structuredJobpostId

          RETURN t {
            .*,
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

  async unrelatePreferredTagToTag(
    preferredTagNodeId: string,
    tagNodeId: string,
  ): Promise<void> {
    await this.neogma.queryRunner.run(
      `
      MATCH (pt:Tag {id: $preferredTagNodeId})-[:HAS_TAG_DESIGNATION]->(:Preferred)
      MATCH (pt)<-[r:IS_SYNONYM_OF]-(t:Tag {id: $tagNodeId})

      DETACH DELETE r
      `,
      { preferredTagNodeId, tagNodeId },
    );

    return;
  }

  async unblockTag(blockedTagNodeId: string, wallet: string): Promise<boolean> {
    await this.neogma.queryRunner.run(
      `
        MATCH (tag:Tag {id: $blockedTagNodeId})-[r:HAS_TAG_DESIGNATION]->(:Blocked)
        DETACH DELETE r

        CREATE (tag)-[r:HAS_TAG_DESIGNATION]->(:Allowed)
        SET r.creator = $wallet
        SET r.timestamp = timestamp()
      `,
      { blockedTagNodeId, wallet },
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
      
      CREATE (t1)<-[ts:IS_SYNONYM_OF]-(t2)

      SET ts.timestamp = timestamp()
      SET ts.synonymNodeId = $secondTagNodeId
      SET ts.creator = $synonymSuggesterWallet

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
    const firstNode = new Tag(first.get("t1"));
    const secondNode = new Tag(second.get("t2"));

    return [firstNode, secondNode];
  }

  async unlinkSynonyms(
    firstTagNodeId: string,
    secondTagNodeId: string,
    creatorWallet: string,
  ): Promise<Tag[]> {
    await this.neogma.queryRunner.run(
      `
        MATCH (t1:Tag {id: $firstTagNodeId})<-[syn:IS_SYNONYM_OF]-(t2:Tag {id: $secondTagNodeId})

        CREATE (t1:Tag {id: $firstTagNodeId})<-[tds:IS_UNLINKED_SYNONYM_OF]-(t2:Tag {id: $secondTagNodeId})
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
