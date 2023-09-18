import { Injectable } from "@nestjs/common";
import { Neogma } from "neogma";
import { InjectConnection } from "nest-neogma";
import { UserFlowEntity as UserFlow } from "../../shared/entities";
import { CreateUserFlowDto } from "./dto/create-user-flow.dto";

@Injectable()
export class UserFlowService {
  constructor(
    @InjectConnection()
    private neogma: Neogma,
  ) {}

  async find(name: string): Promise<UserFlow | undefined> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (uf:UserFlow {name: $name})
        RETURN uf
      `,
      { name },
    );
    return res.records.length
      ? new UserFlow(res.records[0].get("uf"))
      : undefined;
  }

  async create(userFlow: CreateUserFlowDto): Promise<UserFlow> {
    return this.neogma.queryRunner
      .run(
        `
            CREATE (uf:UserFlow { id: randomUUID() })
            SET uf += $properties
            RETURN uf
        `,
        {
          properties: {
            ...userFlow,
          },
        },
      )
      .then(res => new UserFlow(res.records[0].get("uf")));
  }

  async getFlowForWallet(wallet: string): Promise<UserFlow | undefined> {
    const res = await this.neogma.queryRunner.run(
      `
            MATCH (u:User {wallet: $wallet})-[:HAS_USER_FLOW_STAGE]->(uf:UserFlow)
            RETURN uf
        `,
      { wallet },
    );

    return res.records.length
      ? new UserFlow(res.records[0].get("uf"))
      : undefined;
  }

  async hasRelationshipToUser(
    userId: string,
    userRoleId: string,
  ): Promise<boolean> {
    const res = await this.neogma.queryRunner.run(
      `
        MATCH (u:User {id: $userId})
        MATCH (uf:UserFlow {id: $userRoleId})
        WITH u, uf
        RETURN EXISTS( (u)-[:HAS_USER_FLOW_STAGE]->(uf) ) AS result
        `,
      { userId, userRoleId },
    );

    return res.records[0]?.get("result") ?? false;
  }

  async relateUserToUserFlow(
    userId: string,
    userRoleId: string,
  ): Promise<unknown> {
    return this.neogma.queryRunner.run(
      `
        MATCH (u:User {id: $userId})
        MATCH (uf:UserFlow {id: $userRoleId})
        MERGE (u)-[:HAS_USER_FLOW_STAGE]->(uf)
        `,
      { userId, userRoleId },
    );
  }

  async unrelateUserFromUserFlow(
    userId: string,
    userRoleId: string,
  ): Promise<unknown> {
    return this.neogma.queryRunner.run(
      `
        MATCH (u:User {id: $userId})-[r:HAS_USER_FLOW_STAGE]-(uf:UserFlow {id: $userRoleId})
        DELETE r
        `,
      { userId, userRoleId },
    );
  }
}
