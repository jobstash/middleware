import { Injectable } from "@nestjs/common";
import { Neogma } from "neogma";
import { InjectConnection } from "nest-neogma";
import { UserRoleEntity as UserRole } from "../shared/entities";
import { CreateUserRoleDto } from "./dto/create-user-role.dto";

@Injectable()
export class UserRoleService {
  constructor(
    @InjectConnection()
    private neogma: Neogma,
  ) {}

  async find(name: string): Promise<UserRole | undefined> {
    const res = await this.neogma.queryRunner.run(
      `
      MATCH (ur:UserRole {name: $name})
      RETURN ur
      `,
      { name },
    );
    return res.records.length
      ? new UserRole(res.records[0].get("ur"))
      : undefined;
  }

  async create(userRole: CreateUserRoleDto): Promise<UserRole> {
    return this.neogma.queryRunner
      .run(
        `
        CREATE (ur:UserRole { id: randomUUID() })
        SET ur += $properties
        RETURN ur
        `,
        {
          properties: {
            ...userRole,
          },
        },
      )
      .then(res => new UserRole(res.records[0].get("ur")));
  }

  async getRoleForWallet(wallet: string): Promise<UserRole | undefined> {
    const res = await this.neogma.queryRunner.run(
      `
      MATCH (u:User {wallet: $wallet})-[:HAS_ROLE]->(ur:UserRole)
      RETURN ur
      `,
      { wallet },
    );

    return res.records.length
      ? new UserRole(res.records[0].get("ur"))
      : undefined;
  }

  async hasRelationshipToUser(
    userId: string,
    userRoleId: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
      MATCH (u:User {id: $userId})
      MATCH (ur:UserRole {id: $userRoleId})
      u, ur
      RETURN EXISTS( (u)-[:HAS_ROLE]->(ur) ) AS result
      `,
      { userId, userRoleId },
    );

    return res.records[0]?.get("result") ?? false;
  }

  async linkUserToRole(userId: string, userRoleId: string): Promise<unknown> {
    return this.neogma.queryRunner.run(
      `
      MATCH (u:User {id: $userId})
      MATCH (ur:UserRole {id: $userRoleId})
      MERGE (u)-[:HAS_ROLE]->(ur)
      `,
      { userId, userRoleId },
    );
  }

  async unlinkUserFromRole(
    userId: string,
    userRoleId: string,
  ): Promise<unknown> {
    return this.neogma.queryRunner.run(
      `
      MATCH (u:User {id: $userId})-[r:HAS_ROLE]-(ur:UserRole {id: $userRoleId})
      DELETE r
      `,
      { userId, userRoleId },
    );
  }
}
