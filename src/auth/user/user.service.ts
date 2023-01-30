import { Injectable } from "@nestjs/common";
import { Neo4jService } from "nest-neo4j/dist";
import { CreateUserInput } from "../dto/create-user.input";
import { FindOrCreateUserInput } from "../dto/find-or-create-user.input";
import { UpdateUserInput } from "../dto/update-user.input";
import { EncryptionService } from "./encryption/encryption.service";
import { User } from "./user.entity";

@Injectable()
export class UserService {
  constructor(
    private readonly neo4jService: Neo4jService,
    private readonly encryptionService: EncryptionService,
  ) {}

  async find(email: string): Promise<User | undefined> {
    return this.neo4jService
      .read(
        `
            MATCH (u:User {email: $email})
            RETURN u
        `,
        { email },
      )
      .then(res =>
        res.records.length ? new User(res.records[0].get("u")) : undefined,
      );
  }

  async create(user: CreateUserInput): Promise<User> {
    // Encrypt Password
    const password = await this.encryptionService.hash(user.password);

    return this.neo4jService
      .write(
        `
            CREATE (u:User { id: randomUUID() })
            SET u += $properties
            RETURN u
        `,
        {
          properties: {
            ...user,
            password,
          },
        },
      )
      .then(res => new User(res.records[0].get("u")));
  }

  async findOrCreate(details: FindOrCreateUserInput): Promise<User> {
    const { accessToken, refreshToken, profile } = details;
    const result = await this.find(profile.email);
    if (result === undefined) {
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
        .then(res => new User(res.records[0].get("u")));
    } else {
      return Promise.resolve(result);
    }
  }

  async update(id: string, properties: UpdateUserInput): Promise<User> {
    return this.neo4jService
      .write(
        `
            MATCH (u:User { id: $id })
            SET u += $properties
            RETURN u
        `,
        { id, properties },
      )
      .then(res => new User(res.records[0].get("u")));
  }
}
