import { Injectable } from "@nestjs/common";
import { Neo4jService } from "nest-neo4j/dist";
import { User, UserEntity } from "src/shared/types";

@Injectable()
export class UserService {
  constructor(private readonly neo4jService: Neo4jService) {}

  async validateUser(id: string): Promise<User | undefined> {
    const user = await this.find(id);

    if (user) {
      return user.getProperties();
    }

    return undefined;
  }

  async find(id: string): Promise<UserEntity | undefined> {
    return this.neo4jService
      .read(
        `
            MATCH (u:User {id: $id})
            RETURN u
        `,
        { id },
      )
      .then(res =>
        res.records.length
          ? new UserEntity(res.records[0].get("u"))
          : undefined,
      );
  }

  async findByNodeId(nodeId: string): Promise<UserEntity | undefined> {
    return this.neo4jService
      .read(
        `
            MATCH (u:User {githubNodeId: $nodeId})
            RETURN u
        `,
        { nodeId },
      )
      .then(res =>
        res.records.length
          ? new UserEntity(res.records[0].get("u"))
          : undefined,
      );
  }
}
