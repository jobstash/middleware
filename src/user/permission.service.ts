import { randomUUID } from "node:crypto";
import { Injectable } from "@nestjs/common";
import { GraphRepository } from "src/postgres/graph.repository";
import { UserPermissionEntity } from "src/shared/entities/user-permission.entity";
import { ResponseWithNoData, UserPermission } from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { CreateUserPermissionDto } from "./dto/create-user-permission.dto";

@Injectable()
export class PermissionService {
  private readonly logger = new CustomLogger(PermissionService.name);

  constructor(private readonly graph: GraphRepository) {}

  async find(name: string): Promise<UserPermission | undefined> {
    const permission = await this.graph.findNode<Record<string, unknown>>(
      "UserPermission",
      { name },
    );
    return permission
      ? new UserPermissionEntity(
          permission.properties as unknown as UserPermission,
        ).getProperties()
      : undefined;
  }

  async create(input: CreateUserPermissionDto): Promise<UserPermission> {
    const id = randomUUID();
    const permission = await this.graph.createNode(
      "UserPermission",
      { id, ...input },
      `runtime:${id}`,
    );
    return new UserPermissionEntity(
      permission.properties as unknown as UserPermission,
    ).getProperties();
  }

  async getPermissionsForWallet(wallet: string): Promise<UserPermission[]> {
    const permissions = await this.graph.findRelatedNodes<
      Record<string, unknown>
    >({
      sourceLabel: "User",
      sourceWhere: { wallet },
      relationshipType: "HAS_PERMISSION",
      targetLabel: "UserPermission",
    });
    return permissions.map(permission =>
      new UserPermissionEntity(
        permission.properties as unknown as UserPermission,
      ).getProperties(),
    );
  }

  async userHasPermission(wallet: string, name: string): Promise<boolean> {
    if (!(await this.find(name))) {
      this.logger.warn(
        `Attempted to check for permission \`${name}\` that does not exist`,
      );
      return false;
    }
    return this.graph.hasRelationship({
      sourceLabel: "User",
      sourceWhere: { wallet },
      type: "HAS_PERMISSION",
      targetLabel: "UserPermission",
      targetWhere: { name },
    });
  }

  async grantUserPermission(
    wallet: string,
    name: string,
  ): Promise<ResponseWithNoData> {
    if (!(await this.find(name))) {
      this.logger.warn(
        `Attempted to grant permission \`${name}\` that does not exist`,
      );
      return { success: false, message: "Permission not found" };
    }
    if (await this.userHasPermission(wallet, name)) {
      return { success: true, message: "User already has this permission" };
    }
    const linked = await this.graph.setRelationshipsToNodes({
      sourceLabel: "User",
      sourceWhere: { wallet },
      type: "HAS_PERMISSION",
      targetLabel: "UserPermission",
      targetProperty: "name",
      targetValues: [name],
      replace: false,
    });
    return linked.length
      ? { success: true, message: "Permission granted successfully" }
      : { success: false, message: "User not found" };
  }

  async revokeUserPermission(
    wallet: string,
    name: string,
  ): Promise<ResponseWithNoData> {
    if (!(await this.find(name))) {
      this.logger.warn(
        `Attempted to revoke permission \`${name}\` that does not exist`,
      );
      return { success: false, message: "Permission not found" };
    }
    const deleted = await this.graph.deleteRelationshipBetween({
      sourceLabel: "User",
      sourceWhere: { wallet },
      type: "HAS_PERMISSION",
      targetLabel: "UserPermission",
      targetWhere: { name },
    });
    return deleted
      ? { success: true, message: "Permission revoked successfully" }
      : { success: true, message: "User does not have this permission" };
  }

  async syncUserPermissions(
    wallet: string,
    permissions: string[],
  ): Promise<void> {
    await this.graph.setRelationshipsToNodes({
      sourceLabel: "User",
      sourceWhere: { wallet },
      type: "HAS_PERMISSION",
      targetLabel: "UserPermission",
      targetProperty: "name",
      targetValues: permissions,
      replace: true,
    });
  }
}
