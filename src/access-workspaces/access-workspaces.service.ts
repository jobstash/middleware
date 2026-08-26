import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { domainToASCII } from "node:url";
import * as psl from "psl";
import { AccessWorkspacesRepository } from "./access-workspaces.repository";
import { WorkspaceAuthorization } from "./access-workspaces.repository";
import { AgencyBountyOpportunities } from "./access-workspaces.dto";

const EMAIL_LIKE_KEY =
  /(?:^|[_-])(?:e-?mail|contact(?:e-?mail)?|worke-?mail)(?:$|[_-])/i;
const EMAIL_LIKE_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REVEALABLE_FIELDS = new Set(["info.email", "info.contactEmail"]);

const withoutEmailLikeValues = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(withoutEmailLikeValues);
  if (!value || typeof value !== "object") {
    return typeof value === "string" && EMAIL_LIKE_VALUE.test(value)
      ? undefined
      : value;
  }
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !EMAIL_LIKE_KEY.test(key))
      .map(([key, item]) => [key, withoutEmailLikeValues(item)])
      .filter(([, item]) => item !== undefined),
  );
};

const valueAtPath = (source: Record<string, unknown>, path: string): unknown =>
  path.split(".").reduce<unknown>((value, part) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return undefined;
    }
    return (value as Record<string, unknown>)[part];
  }, source);

const bountyOpportunityLimit = (requestedLimit: number): number =>
  Number.isSafeInteger(requestedLimit)
    ? Math.max(1, Math.min(requestedLimit, 100))
    : 50;

@Injectable()
export class AccessWorkspacesService {
  constructor(private readonly repository: AccessWorkspacesRepository) {}

  private normalizedRegistrableDomain(input: string): string {
    const candidate = domainToASCII(
      input
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, "")
        .split("/")[0],
    ).replace(/\.$/, "");
    if (!candidate || /[@:\s]/.test(candidate)) {
      throw new BadRequestException("A valid registrable domain is required");
    }
    const registrable = psl.get(candidate);
    if (!registrable || registrable !== candidate) {
      throw new BadRequestException(
        "Use the registrable domain without a subdomain",
      );
    }
    return registrable;
  }

  async create(
    actorUserId: string,
    primaryProfileId: string,
    domain: string,
  ): Promise<Record<string, unknown>> {
    let workspace: Record<string, unknown> | null;
    try {
      workspace = await this.repository.create({
        ownerUserId: actorUserId,
        primaryProfileId,
        normalizedDomain: this.normalizedRegistrableDomain(domain),
      });
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new ConflictException(
          "The Profile or registrable domain already belongs to a workspace",
        );
      }
      throw error;
    }
    if (!workspace) throw new NotFoundException("Profile not found");
    return workspace;
  }

  async get(
    workspaceId: string,
    actorUserId: string,
  ): Promise<Record<string, unknown>> {
    const workspace = await this.repository.getForMember(
      workspaceId,
      actorUserId,
    );
    if (!workspace) throw new NotFoundException("Workspace not found");
    return workspace;
  }

  async list(actorUserId: string): Promise<Record<string, unknown>[]> {
    return this.repository.listForMember(actorUserId);
  }

  async requireAgencyEntitlement(
    workspaceId: string,
    actorUserId: string,
  ): Promise<WorkspaceAuthorization> {
    const authorization = await this.repository.authorize(
      workspaceId,
      actorUserId,
    );
    if (!authorization?.entitled) {
      throw new ForbiddenException("An active Agency entitlement is required");
    }
    return authorization;
  }

  async listBountyOpportunities(
    workspaceId: string,
    actorUserId: string,
    requestedLimit: number,
    includeOffline = false,
  ): Promise<AgencyBountyOpportunities> {
    await this.requireAgencyEntitlement(workspaceId, actorUserId);
    return this.repository.listBountyOpportunities(
      bountyOpportunityLimit(requestedLimit),
      includeOffline,
    );
  }

  async listBountyOpportunitiesForSuperadmin(
    requestedLimit: number,
    includeOffline = false,
  ): Promise<AgencyBountyOpportunities> {
    return this.repository.listBountyOpportunities(
      bountyOpportunityLimit(requestedLimit),
      includeOffline,
    );
  }

  async transferDomain(
    workspaceId: string,
    actorUserId: string,
    domain: string,
    reason: string,
    superadminBypass: boolean,
  ): Promise<Record<string, unknown>> {
    try {
      const result = await this.repository.transferDomain({
        targetWorkspaceId: workspaceId,
        actorUserId,
        normalizedDomain: this.normalizedRegistrableDomain(domain),
        reason: reason.trim(),
        superadminBypass,
      });
      if (result.status === "not_found") {
        throw new NotFoundException("Target workspace not found");
      }
      if (result.status === "active_source_requires_bypass") {
        throw new ConflictException(
          "An active source workspace requires an explicit superadmin bypass",
        );
      }
      if (result.status === "unchanged") {
        throw new ConflictException("Workspace already owns this domain");
      }
      if (result.status !== "transferred") {
        throw new ConflictException("Domain transfer was not applied");
      }
      return result.value;
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new ConflictException(
          "Domain transfer conflicted with live state",
        );
      }
      throw error;
    }
  }

  async putMember(
    workspaceId: string,
    actorUserId: string,
    userId: string,
    role: "admin" | "analyst" | "viewer",
  ): Promise<void> {
    if (
      !(await this.repository.putMember({
        workspaceId,
        actorUserId,
        userId,
        role,
      }))
    ) {
      throw new ForbiddenException("Workspace member update was not allowed");
    }
  }

  async removeMember(
    workspaceId: string,
    actorUserId: string,
    userId: string,
  ): Promise<void> {
    if (
      !(await this.repository.removeMember({
        workspaceId,
        actorUserId,
        userId,
      }))
    ) {
      throw new ForbiddenException("Workspace member removal was not allowed");
    }
  }

  async inspect(
    workspaceId: string,
    actorUserId: string,
    slug: string,
  ): Promise<Record<string, unknown>> {
    const result = await this.repository.inspectProfile({
      workspaceId,
      actorUserId,
      slug,
    });
    if (!result.authorization?.entitled) {
      throw new ForbiddenException("An active Agency entitlement is required");
    }
    if (!result.payload) throw new NotFoundException("Profile not found");
    return withoutEmailLikeValues(result.payload) as Record<string, unknown>;
  }

  async reveal(
    workspaceId: string,
    actorUserId: string,
    slug: string,
    fields: string[],
  ): Promise<Record<string, unknown>> {
    if (!fields.length || fields.some(field => !REVEALABLE_FIELDS.has(field))) {
      throw new BadRequestException("Unsupported reveal field");
    }
    const result = await this.repository.inspectProfile({
      workspaceId,
      actorUserId,
      slug,
      revealedFields: fields,
    });
    if (!result.authorization?.entitled) {
      throw new ForbiddenException("An active Agency entitlement is required");
    }
    if (result.authorization.role === "viewer") {
      throw new ForbiddenException("Viewer members cannot reveal fields");
    }
    if (!result.payload) throw new NotFoundException("Profile not found");
    if ((result.recentRevealCount ?? 0) >= 10) {
      throw new HttpException(
        "Reveal rate limit exceeded",
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return Object.fromEntries(
      fields.map(field => [field, valueAtPath(result.payload!, field)]),
    );
  }
}
