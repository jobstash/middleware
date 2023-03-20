import { Injectable } from "@nestjs/common";
import { Neo4jService } from "nest-neo4j";
import { Technology } from "src/shared/interfaces";

@Injectable()
export class TechnologiesService {
  constructor(private readonly neo4jService: Neo4jService) {}

  async getAll(): Promise<Technology[]> {
    return this.neo4jService
      .read("MATCH (t: Technology) RETURN t")
      .then(res =>
        res.records.map(record => record.get("t").properties as Technology),
      );
  }
}
