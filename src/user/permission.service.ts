import { Injectable } from "@nestjs/common";
import { Neogma } from "neogma";
import { InjectConnection } from "nestjs-neogma";
import { ResponseWithNoData, UserPermission } from "src/shared/interfaces";
import { CreateUserPermissionDto } from "./dto/create-user-permission.dto";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { UserPermissionEntity } from "src/shared/entities/user-permission.entity";

@Injectable()
export class PermissionService {
  private logger = new CustomLogger(PermissionService.name);
  constructor(
    @InjectConnection()
    private neogma: Neogma,
  ) {}

  async find(name: string): Promise<UserPermission | undefined> {
    const res = await this.neogma.queryRunner.run(
      `
      MATCH (up:UserPermission {name: $name})
      RETURN up { .* }
      `,
      { name },
    );
    return res.records.length
      ? new UserPermissionEntity(res.records[0].get("up")).getProperties()
      : undefined;
  }

  async create(
    userPermission: CreateUserPermissionDto,
  ): Promise<UserPermission> {
    return this.neogma.queryRunner
      .run(
        `
        CREATE (up:UserPermission { id: randomUUID() })
        SET up += $properties
        RETURN up { .* }
        `,
        {
          properties: {
            ...userPermission,
          },
        },
      )
      .then(res =>
        new UserPermissionEntity(res.records[0].get("ur")).getProperties(),
      );
  }

  async getPermissionsForWallet(wallet: string): Promise<UserPermission[]> {
    const res = await this.neogma.queryRunner.run(
      `
      MATCH (u:User {wallet: $wallet})-[:HAS_PERMISSION]->(up:UserPermission)
      RETURN up { .* }
      `,
      { wallet },
    );

    return res.records.length
      ? res.records.map(record =>
          new UserPermissionEntity(record.get("up")).getProperties(),
        )
      : [];
  }

  async userHasPermission(wallet: string, name: string): Promise<boolean> {
    if (await this.find(name)) {
      const res = await this.neogma.queryRunner.run(
        `
      RETURN EXISTS((:User {wallet: $wallet})-[:HAS_PERMISSION]->(:UserPermission {name: $name})) as hasPermission
      `,
        { wallet, name },
      );

      return res.records[0]?.get("hasPermission") as boolean;
    } else {
      this.logger.warn(
        `Attempted to check for permission \`${name}\` that does not exist`,
      );
      return false;
    }
  }

  async grantUserPermission(
    wallet: string,
    name: string,
  ): Promise<ResponseWithNoData> {
    const permission = await this.find(name);
    if (permission) {
      if (await this.userHasPermission(wallet, name)) {
        return {
          success: true,
          message: "User already has this permission",
        };
      } else {
        await this.neogma.queryRunner.run(
          `
        MATCH (u:User {wallet: $wallet}), (up:UserPermission {name: $name})
        MERGE (u)-[:HAS_PERMISSION]->(up)
        `,
          { wallet, name },
        );
        return {
          success: true,
          message: "Permission granted successfully",
        };
      }
    } else {
      this.logger.warn(
        `Attempted to grant permission \`${name}\` that does not exist`,
      );
      return {
        success: false,
        message: "Permission not found",
      };
    }
  }

  async revokeUserPermission(
    wallet: string,
    name: string,
  ): Promise<ResponseWithNoData> {
    const permission = await this.find(name);
    if (permission) {
      if (await this.userHasPermission(wallet, name)) {
        await this.neogma.queryRunner.run(
          `
            MATCH (u:User {wallet: $wallet})-[r:HAS_PERMISSION]->(up:UserPermission {name: $name})
            DELETE r
          `,
          { wallet, name },
        );
        return {
          success: true,
          message: "Permission revoked successfully",
        };
      } else {
        return {
          success: true,
          message: "User does not have this permission",
        };
      }
    } else {
      this.logger.warn(
        `Attempted to revoke permission \`${name}\` that does not exist`,
      );
      return {
        success: false,
        message: "Permission not found",
      };
    }
  }

  async syncUserPermissions(
    wallet: string,
    permissions: string[],
  ): Promise<void> {
    const existingPermissions = await this.getPermissionsForWallet(wallet);
    const permissionsToAdd = permissions.filter(
      x => !existingPermissions.some(y => y.name === x),
    );
    const permissionsToRemove = existingPermissions.filter(
      x => !permissions.some(y => y === x.name),
    );
    for (const permission of permissionsToAdd) {
      await this.grantUserPermission(wallet, permission);
    }
    for (const permission of permissionsToRemove) {
      await this.revokeUserPermission(wallet, permission.name);
    }
  }
}
