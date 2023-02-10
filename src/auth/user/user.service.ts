import { Injectable } from "@nestjs/common";
import { Neo4jService } from "nest-neo4j/dist";
import { CreateUserInput } from "../dto/create-user.input";
import { UserEntity } from "src/shared/types";

@Injectable()
export class UserService {
  constructor(private readonly neo4jService: Neo4jService) {}

  async find(id: number): Promise<UserEntity | undefined> {
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

  async create(details: CreateUserInput): Promise<UserEntity> {
    const { accessToken, refreshToken, profile } = details;
    // TODO: Switch this to an integration with the backend!
    return this.neo4jService
      .write(
        `
            CREATE (u:User { id: randomUUID() })
            SET u += $properties
            RETURN u
        `,
        {
          properties: {
            ...profile,
            accessToken,
            refreshToken,
          },
        },
      )
      .then(res => new UserEntity(res.records[0].get("u")));
  }
}
