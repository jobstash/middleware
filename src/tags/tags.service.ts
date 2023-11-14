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
import { normalizeString } from "src/shared/helpers";

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
    return res.records.length ? new TagEntity(res.records[0]?.get("t")) : null;
  }

  async findPreferredTagByNormalizedName(
    normalizedPreferredName: string,
  ): Promise<TagPreference | null> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (pt:Tag {normalizedName: $normalizedPreferredName})-[:HAS_TAG_DESIGNATION]->(:PreferredDesignation)
        RETURN {
          tag: pt { .* },
          synonyms: [(pt)<-[:IS_SYNONYM_OF]-(synonym: Tag) | synonym { .* }]
        } as res
      `,
      { normalizedPreferredName },
    );
    return res.records.length
      ? new TagPreference(res.records[0].get("res"))
      : null;
  }

  async findBlockedTagByNormalizedName(
    normalizedName: string,
  ): Promise<TagEntity | null> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (bt:Tag {normalizedName: $normalizedName})-[:HAS_TAG_DESIGNATION]->(:BlockedDesignation)
        RETURN bt
      `,
      { normalizedName },
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
          MERGE (dd:DefaultDesignation {name: "DefaultDesignation"})
          CREATE (t:Tag { id: randomUUID() })-[r:HAS_TAG_DESIGNATION]->(dd)
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

  async blockTag(
    normalizedName: string,
    creatorWallet: string,
  ): Promise<TagEntity> {
    return this.neogma.queryRunner
      .run(
        `
          MERGE (bd:BlockedDesignation {name: "BlockedDesignation"})
          WITH bd
          MATCH (bt:Tag {normalizedName: $normalizedName})-[r:HAS_TAG_DESIGNATION]->(:AllowedDesignation|DefaultDesignation)
          DETACH DELETE r

          WITH bt
          CREATE (bt)-[r:HAS_TAG_DESIGNATION]->(bd)
          SET r.creator = $creatorWallet
          SET r.timestamp = timestamp()
          RETURN bt
          `,
        {
          normalizedName,
          creatorWallet,
        },
      )
      .then(res => new TagEntity(res.records[0].get("bt")));
  }

  async preferTag(
    normalizedName: string,
    creatorWallet: string,
  ): Promise<TagEntity> {
    return this.neogma.queryRunner
      .run(
        `
          MERGE (pd:PreferredDesignation {name: "PreferredDesignation"})
          WITH pd
          MATCH (pt:Tag {normalizedName: $normalizedName})
          CREATE (pt)-[r:HAS_TAG_DESIGNATION]->(pd)
          SET r.creator = $creatorWallet
          SET r.timestamp = timestamp()
          RETURN pt
          `,
        {
          normalizedName,
          creatorWallet,
        },
      )
      .then(res => new TagEntity(res.records[0].get("pt")));
  }

  async hasBlockedRelation(normalizedName: string): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        RETURN EXISTS( (:Tag {normalizedName: $normalizedName})-[:HAS_TAG_DESIGNATION]->(:BlockedDesignation) ) AS result
        `,
      { normalizedName },
    );

    return (res.records[0]?.get("result") as boolean) ?? false;
  }

  async hasPreferredRelation(normalizedName: string): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        RETURN EXISTS( (:Tag {normalizedName: $normalizedName})-[:HAS_TAG_DESIGNATION]->(:PreferredDesignation) ) AS result
        `,
      { normalizedName },
    );

    return (res.records[0]?.get("result") as boolean) ?? false;
  }

  async hasRelationToPreferredTag(
    preferredNormalizedName: string,
    synonymNormalizedName: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (pt:Tag {normalizedName: $preferredNormalizedName})-[:HAS_TAG_DESIGNATION]->(:PreferredDesignation), (st:Tag {normalizedName: $synonymNormalizedName})
        RETURN EXISTS( (pt)<-[:IS_SYNONYM_OF]-(st) ) AS result
        `,
      { preferredNormalizedName, synonymNormalizedName },
    );

    return (res.records[0]?.get("result") as boolean) ?? false;
  }

  async hasPreferredTagCreatorRelationship(
    preferredNormalizedName: string,
    wallet: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (:Tag {normalizedName: $preferredNormalizedName})-[r:HAS_TAG_DESIGNATION]->(:PreferredDesignation)
        RETURN r.creator = $wallet AS result
        `,
      { preferredNormalizedName, wallet },
    );

    return (res.records[0]?.get("result") as boolean) ?? false;
  }

  async hasBlockedTagCreatorRelationship(
    blockedNormalizedName: string,
    wallet: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (:Tag {normalizedName: $blockedNormalizedName})-[r:HAS_TAG_DESIGNATION]->(:BlockedDesignation)
        RETURN r.creator = $wallet AS result
        `,
      { blockedNormalizedName, wallet },
    );

    return (res.records[0]?.get("result") as boolean) ?? false;
  }

  async relatePreferredTagToTag(
    preferredNormalizedName: string,
    synonymNormalizedName: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (pt:Tag {normalizedName: $preferredNormalizedName})-[:HAS_TAG_DESIGNATION]->(:PreferredDesignation), (t:Tag {normalizedName: $synonymNormalizedName})

        CREATE (pt)<-[r:IS_SYNONYM_OF]-(t)
        SET r.timestamp = timestamp()

        RETURN true as result;
        `,
      { preferredNormalizedName, synonymNormalizedName },
    );

    return res.records[0]?.get("result") as boolean;
  }

  async relatePairedTags(
    normalizedOriginTagName: string,
    normalizedPairTagNameList: string[],
    creatorWallet: string,
  ): Promise<boolean> {
    try {
      await this.neogma.queryRunner.run(
        `
          MERGE (pd:PairedDesignation {name: "PairedDesignation"})
          WITH pd
          MATCH (t1:Tag {normalizedName: $normalizedOriginTagName})
          MERGE (t1)-[:HAS_TAG_DESIGNATION]->(pd)

          WITH t1

          OPTIONAL MATCH (t1)-[r:IS_PAIR_OF]->(t2)
          DETACH DELETE r

          WITH t1
          
          UNWIND $normalizedPairTagNameList AS pairTagNormalizedName
          MATCH (t2:Tag {normalizedName: pairTagNormalizedName})

          CREATE (t1)-[p:IS_PAIR_OF]->(t2)
          SET p.timestamp = timestamp()
          SET p.creator = $creatorWallet
        `,
        {
          normalizedOriginTagName,
          normalizedPairTagNameList,
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
    preferredNormalizedName: string,
    synonymNormalizedName: string,
  ): Promise<void> {
    await this.neogma.queryRunner.run(
      `
      MATCH (pt:Tag {normalizedName: $preferredNormalizedName})-[:HAS_TAG_DESIGNATION]->(:PreferredDesignation)
      MATCH (pt)<-[r:IS_SYNONYM_OF]-(t:Tag {normalizedName: $synonymNormalizedName})

      DETACH DELETE r
      `,
      { preferredNormalizedName, synonymNormalizedName },
    );

    return;
  }

  async unblockTag(normalizedName: string, wallet: string): Promise<boolean> {
    await this.neogma.queryRunner.run(
      `
        MATCH (tag:Tag {normalizedName: $normalizedName})-[r:HAS_TAG_DESIGNATION]->(:BlockedDesignation)
        DETACH DELETE r

        MERGE (ad:AllowedDesignation {name: "AllowedDesignation"})
        WITH ad
        CREATE (tag)-[nr:HAS_TAG_DESIGNATION]->(ad)
        SET nr.creator = $wallet
        SET nr.timestamp = timestamp()
      `,
      { normalizedName, wallet },
    );

    return;
  }

  async linkSynonyms(
    originTagNormalizedName: string,
    synonymNormalizedName: string,
    synonymSuggesterWallet: string,
  ): Promise<Tag[]> {
    const res = await this.neogma.queryRunner.run(
      `
      MATCH (t1:Tag {normalizedName: $originTagNormalizedName}), (t2:Tag {normalizedName: $synonymNormalizedName})
      
      CREATE (t1)<-[ts:IS_SYNONYM_OF]-(t2)

      SET ts.timestamp = timestamp()
      SET ts.synonymNodeId = $secondTagNodeId
      SET ts.creator = $synonymSuggesterWallet

      RETURN t1, t2
      `,
      {
        originTagNormalizedName,
        synonymNormalizedName,
        synonymSuggesterWallet,
      },
    );

    if (res.records.length === 0) {
      throw new NotFoundError(
        `Could not link synonym Tags ${originTagNormalizedName} and ${synonymNormalizedName}`,
      );
    }

    const [first, second] = res.records;
    const firstNode = new Tag(first.get("t1"));
    const secondNode = new Tag(second.get("t2"));

    return [firstNode, secondNode];
  }

  async unlinkSynonyms(
    originTagNormalizedName: string,
    synonymNormalizedName: string,
    synonymSuggesterWallet: string,
  ): Promise<Tag[]> {
    await this.neogma.queryRunner.run(
      `
        MATCH (t1:Tag {normalizedName: $originTagNormalizedName})<-[syn:IS_SYNONYM_OF]-(t2:Tag {normalizedName: $synonymNormalizedName})

        CREATE (t1)<-[tds:IS_UNLINKED_SYNONYM_OF]-(t2)
        SET tds.synonymNodeId = $secondTagNodeId
        SET tds.timestamp = timestamp()

        DETACH DELETE syn
      `,
      {
        originTagNormalizedName,
        synonymNormalizedName,
        synonymSuggesterWallet,
      },
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
    return normalizeString(name);
  }
}
