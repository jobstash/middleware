import { Injectable } from "@nestjs/common";
import { Neo4jService } from "nest-neo4j/dist";
import { StructuredJobpostEntity } from "src/shared/types";

@Injectable()
export class JobsService {
  constructor(private readonly neo4jService: Neo4jService) {}
  async findAll(): Promise<StructuredJobpostEntity[]> {
    return this.neo4jService
      .read(
        `
            MATCH (j:StructuredJobpost)
            RETURN j
        `,
      )
      .then(res =>
        res.records.map(record => new StructuredJobpostEntity(record.get("j"))),
      );
  }
}
