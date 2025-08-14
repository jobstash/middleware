import { Injectable } from "@nestjs/common";
import * as Sentry from "@sentry/node";
import axios from "axios";
import { randomUUID } from "crypto";
import { now, uniqBy } from "lodash";
import { Integer } from "neo4j-driver";
import { Neogma } from "neogma";
import { InjectConnection } from "nestjs-neogma";
import { ModelService } from "src/model/model.service";
import { ScorerService } from "src/scorer/scorer.service";
import {
  UserOrgEntity,
  UserProfileEntity,
  UserRepoEntity,
  UserShowCaseEntity,
  UserSkillEntity,
  UserWorkHistoryEntity,
} from "src/shared/entities";
import { OrgStaffReviewEntity } from "src/shared/entities/org-staff-review.entity";
import {
  intConverter,
  nonZeroOrNull,
  paginate,
  slugify,
} from "src/shared/helpers";
import {
  AdjacentRepo,
  EcosystemActivation,
  OrgStaffReview,
  PaginatedData,
  Response,
  ResponseWithNoData,
  ResponseWithOptionalData,
  UserGithubOrganization,
  UserOrg,
  UserProfile,
  UserRepo,
  UserShowCase,
  UserSkill,
  UserVerificationStatus,
  UserVerifiedOrg,
  UserWorkHistory,
  data,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { GithubUserService } from "../github/github-user.service";
import { RateOrgInput } from "./dto/rate-org.input";
import { RepoListParams } from "./dto/repo-list.input";
import { ReviewOrgSalaryInput } from "./dto/review-org-salary.input";
import { ReviewOrgInput } from "./dto/review-org.input";
import { UpdateDevLocationInput } from "./dto/update-dev-location.input";
import { UpdateRepoContributionInput } from "./dto/update-repo-contribution.input";
import { UpdateRepoTagsUsedInput } from "./dto/update-repo-tags-used.input";
import { UpdateUserShowCaseInput } from "./dto/update-user-showcase.input";
import { UpdateUserSkillsInput } from "./dto/update-user-skills.input";
import { addDays } from "date-fns";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class ProfileService {
  private readonly logger = new CustomLogger(ProfileService.name);

  constructor(
    @InjectConnection()
    private neogma: Neogma,
    private models: ModelService,
    private scorerService: ScorerService,
    private configService: ConfigService,
    private githubUserService: GithubUserService,
  ) {}

  async getUserProfile(
    wallet: string,
  ): Promise<ResponseWithOptionalData<UserProfile>> {
    if (wallet) {
      try {
        const result = await this.neogma.queryRunner.run(
          `
            MATCH (user:User {wallet: $wallet})
            RETURN user {
              .*,
              wallet: $wallet,
              githubAvatar: [(user)-[:HAS_GITHUB_USER]->(gu:GithubUser) | gu.avatarUrl][0],
              alternateEmails: [(user)-[:HAS_EMAIL]->(email:UserEmail) | email.email],
              location: [(user)-[:HAS_LOCATION]->(location: UserLocation) | location { .* }][0],
              linkedAccounts: [(user)-[:HAS_LINKED_ACCOUNT]->(account: LinkedAccount) | account { .* }][0],
              wallets: [(user)-[:HAS_LINKED_WALLET]->(wallet:LinkedWallet) | wallet.address]
            } as profile
          `,
          { wallet },
        );

        const profile = result.records[0]?.get("profile");

        return {
          success: true,
          message: "User Profile retrieved successfully",
          data: profile
            ? new UserProfileEntity({
                ...profile,
                linkedAccounts: {
                  ...profile.linkedAccounts,
                  wallets: profile.wallets,
                },
              }).getProperties()
            : undefined,
        };
      } catch (err) {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "profile.service",
          });
          scope.setExtra("input", wallet);
          Sentry.captureException(err);
        });
        this.logger.error(`ProfileService::getUserProfile ${err.message}`);
        return {
          success: false,
          message: "Error retrieving user profile",
        };
      }
    } else {
      return {
        success: false,
        message: "Invalid wallet",
      };
    }
  }

  async getUserRepos(
    wallet: string,
    params: RepoListParams,
  ): Promise<PaginatedData<UserRepo> | ResponseWithNoData> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet})-[:HAS_GITHUB_USER]->(gu:GithubUser)-[r:CONTRIBUTED_TO]->(repo:GithubRepository)
        RETURN repo {
          id: repo.id,
          name: repo.nameWithOwner,
          description: repo.description,
          timestamp: repo.updatedAt.epochMillis,
          org: [(organization: Organization)-[:HAS_GITHUB|HAS_REPOSITORY*2]->(repo) | organization {
            url: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
            name: organization.name,
            logo: organization.logo
          }][0],
          tags: apoc.coll.toSet([(gu)-[:USED_TAG]->(tag:LegacyTag)-[:USED_ON]->(repo) WHERE (user)-[:HAS_SKILL]->(tag:LegacyTag) | tag {
            .*,
            canTeach: [(user)-[m:HAS_SKILL]->(tag:LegacyTag)-[:USED_ON]->(repo) | m.canTeach][0]
          }]),
          contribution: r.summary
        }
        ORDER BY repo.updatedAt DESC
      `,
        { wallet },
      );

      const final = result.records.map(record =>
        new UserRepoEntity(record?.get("repo")).getProperties(),
      );

      const { page, limit } = params;
      return paginate<UserRepo>(page, limit, final);
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, ...params });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::getUserRepos ${err.message}`);
      return {
        success: false,
        message: "Error retrieving user repos",
      };
    }
  }

  async getUserOrgs(
    wallet: string,
  ): Promise<ResponseWithOptionalData<UserOrg[]>> {
    try {
      const prelim = data(await this.getUserVerifications(wallet));

      const result = await this.neogma.queryRunner.run(
        `
            MATCH (user:User {wallet: $wallet})
            OPTIONAL MATCH (user)-[:LEFT_REVIEW]->(review:OrgReview)<-[:HAS_REVIEW]-(organization)
            RETURN {
              compensation: {
                salary: review.salary,
                currency: review.currency,
                offersTokenAllocation: review.offersTokenAllocation
              },
              rating: {
                onboarding: review.onboarding,
                careerGrowth: review.careerGrowth,
                benefits: review.benefits,
                workLifeBalance: review.workLifeBalance,
                diversityInclusion: review.diversityInclusion,
                management: review.management,
                product: review.product,
                compensation: review.compensation
              },
              review: {
                id: review.id,
                title: review.title,
                location: review.location,
                timezone: review.timezone,
                pros: review.pros,
                cons: review.cons
              },
              reviewedTimestamp: review.reviewedTimestamp,
              org: organization {
                id: organization.id,
                name: organization.name,
                logo: organization.logo,
                orgId: organization.orgId,
                summary: organization.summary,
                altName: organization.altName,
                location: organization.location,
                headCount: organization.headCount,
                description: organization.description,
                jobsiteLink: organization.jobsiteLink,
                updatedTimestamp: organization.updatedTimestamp,
                docs: [(organization)-[:HAS_DOCSITE]->(docsite) | docsite.url][0],
                github: [(organization)-[:HAS_GITHUB]->(github:GithubOrganization) | github.login][0],
                website: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
                discord: [(organization)-[:HAS_DISCORD]->(discord) | discord.invite][0],
                telegram: [(organization)-[:HAS_TELEGRAM]->(telegram) | telegram.username][0],
                twitter: [(organization)-[:HAS_TWITTER]->(twitter) | twitter.username][0]
              }
            } as org
          `,
        { wallet, orgIds: prelim.map(x => x.id) ?? [] },
      );

      const orgs =
        result.records.length > 0
          ? (result.records?.map(res =>
              new UserOrgEntity(res.get("org")).getProperties(),
            ) ?? [])
          : [];

      return {
        success: true,
        message: "Retrieved user orgs successfully",
        data: orgs,
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::getUserOrgs ${err.message}`);
      return {
        success: false,
        message: "Error retrieving user orgs",
      };
    }
  }

  private async refetchUserVerifications(
    wallet: string,
    withEcosystemActivations = false,
  ): Promise<UserVerifiedOrg[]> {
    try {
      const profile = data(await this.getUserProfile(wallet));
      if (profile) {
        const orgs: UserVerifiedOrg[] = [];

        this.logger.log(`Fetching work history for ${wallet}`);
        const workHistory = await this.getUserWorkHistory(wallet, true);
        const prelim: UserWorkHistory[] = workHistory?.workHistory ?? [];

        if (profile?.linkedAccounts?.github) {
          this.logger.log(
            `Fetching org verifications for ${wallet} based on github username`,
          );
          const names = prelim.map(x => x.name);
          const result = await this.neogma.queryRunner.run(
            `
            MATCH (user:User {wallet: $wallet}), (organization: Organization WHERE organization.name IN $names)
            RETURN apoc.coll.toSet(COLLECT(organization {
              id: organization.orgId,
              name: organization.name,
              url: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
              hasOwner: CASE WHEN EXISTS((:User)-[:OCCUPIES]->(:OrgUserSeat { seatType: "owner" })<-[:HAS_USER_SEAT]-(organization)) THEN true ELSE false END,
              isOwner: CASE WHEN EXISTS((:User {wallet: $wallet})-[:OCCUPIES]->(:OrgUserSeat { seatType: "owner" })<-[:HAS_USER_SEAT]-(organization)) THEN true ELSE false END,
              isMember: CASE WHEN EXISTS((:User {wallet: $wallet})-[:OCCUPIES]->(:OrgUserSeat)<-[:HAS_USER_SEAT]-(organization)) THEN true ELSE false END,
              logo: organization.logoUrl
            })) as orgsByRepo
          `,
            { wallet, names },
          );
          const orgsByRepo =
            result?.records[0]
              ?.get("orgsByRepo")
              ?.map((record: unknown) => record as UserVerifiedOrg) ?? [];
          const processed = orgsByRepo.map(
            (x: UserVerifiedOrg) =>
              new UserVerifiedOrg({
                id: x.id,
                name: x.name,
                slug: slugify(x.name),
                url: x.url,
                logo: x.logo ?? null,
                account: profile.linkedAccounts.github,
                hasOwner: x.hasOwner,
                isOwner: x.isOwner,
                isMember: x.isMember,
                credential: "github",
              }),
          );
          orgs.push(...processed);
        }

        const emails = [
          ...profile.alternateEmails,
          profile?.linkedAccounts?.email,
          profile?.linkedAccounts?.google,
        ].filter(Boolean);

        if (emails.length > 0) {
          this.logger.log(
            `Fetching org verifications for ${wallet} based on email`,
          );
          const result = await this.neogma.queryRunner.run(
            `
            MATCH (organization: Organization)-[:HAS_WEBSITE]->(website: Website)
            UNWIND $emails as email
            WITH email, website, organization
            WHERE email IS NOT NULL AND website IS NOT NULL AND apoc.data.url(website.url).host = apoc.data.email(email).domain
            RETURN apoc.coll.toSet(COLLECT(organization {
              id: organization.orgId,
              name: organization.name,
              url: [(organization)-[:HAS_WEBSITE]->(website) | website.url][0],
              hasOwner: CASE WHEN EXISTS((:User)-[:OCCUPIES]->(:OrgUserSeat { seatType: "owner" })<-[:HAS_USER_SEAT]-(organization)) THEN true ELSE false END,
              isOwner: CASE WHEN EXISTS((:User {wallet: $wallet})-[:OCCUPIES]->(:OrgUserSeat { seatType: "owner" })<-[:HAS_USER_SEAT]-(organization)) THEN true ELSE false END,
              isMember: CASE WHEN EXISTS((:User {wallet: $wallet})-[:OCCUPIES]->(:OrgUserSeat)<-[:HAS_USER_SEAT]-(organization)) THEN true ELSE false END,
              logo: organization.logoUrl,
              account: email
            })) as orgsByEmail
          `,
            { wallet, emails },
          );
          const orgsByEmail =
            result?.records[0]
              ?.get("orgsByEmail")
              ?.map(record => record as UserVerifiedOrg) ?? [];
          orgsByEmail.forEach(x => {
            const exists = orgs.some(y => y.id === x.id);
            if (!exists) {
              orgs.push(
                new UserVerifiedOrg({
                  id: x.id,
                  name: x.name,
                  slug: slugify(x.name),
                  url: x.url,
                  logo: x.logo ?? null,
                  account: x.account,
                  isMember: x.isMember,
                  hasOwner: x.hasOwner,
                  isOwner: x.isOwner,
                  credential: "email",
                }),
              );
            }
          });
        }

        this.logger.log(
          `Found ${orgs.length === 1 ? `${orgs.length} verification` : `${orgs.length > 0 ? orgs.length : "no"} verifications`} for ${wallet}`,
        );

        this.logger.log(`Persisting user verifications for ${wallet}`);

        await this.neogma.queryRunner.run(
          `
          MATCH (user:User {wallet: $wallet})
          OPTIONAL MATCH (user)-[r:VERIFIED_FOR_ORG]->(:Organization)
          DELETE r

          WITH user
          UNWIND $orgs as org
          MATCH (organization:Organization {orgId: org.id})
          MERGE (user)-[nr:VERIFIED_FOR_ORG]->(organization)
          SET nr.credential = org.credential
          SET nr.account = org.account
          SET nr.verifiedTimestamp = timestamp()
        `,
          { wallet, orgs },
        );

        this.logger.log(`Persisted user verifications for ${wallet}`);

        await this.refreshUserCacheLock([wallet]);

        if (
          withEcosystemActivations &&
          (workHistory?.wallets?.length ?? 0) > 0
        ) {
          this.logger.log(
            `Fetching verifications for ${wallet} based on ecosystem activations`,
          );
          const mapped: UserVerifiedOrg[] =
            workHistory?.wallets?.flatMap(x =>
              x.ecosystemActivations.map(
                y =>
                  new UserVerifiedOrg({
                    id: y.id,
                    name: y.name,
                    slug: slugify(y.name),
                    url: "http://ethglobal.com/packs",
                    logo: "http://ethglobal.com",
                    account: x.address,
                    hasOwner: true,
                    isOwner: true,
                    isMember: true,
                    credential: "ecosystemActivation",
                  }),
              ),
            ) ?? [];
          mapped.forEach(x => {
            const exists = orgs.some(y => y.id === x.id);
            if (!exists) {
              orgs.push(x);
            }
          });
        }
        return orgs;
      } else {
        return [];
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet });
        Sentry.captureException(err);
      });
      this.logger.error(
        `ProfileService::refreshUserVerifications ${err.message}`,
      );
      return [];
    }
  }

  async getUserVerifications(
    wallet: string,
    bypassCache = false,
    withEcosystemActivations = false,
  ): Promise<ResponseWithOptionalData<UserVerifiedOrg[]>> {
    const cacheLock = await this.getUserCacheLock(wallet);
    if (bypassCache || !cacheLock || cacheLock <= now()) {
      this.logger.log(`Refreshing user verifications for ${wallet}`);
      const verifications = await this.refetchUserVerifications(
        wallet,
        withEcosystemActivations,
      );
      return {
        success: true,
        message: "Retrieved user verifications successfully",
        data: verifications,
      };
    } else {
      this.logger.log(`Fetching cached user orgs verifications for ${wallet}`);
      try {
        const result = await this.neogma.queryRunner.run(
          `
            MATCH (user:User {wallet: $wallet})-[run:VERIFIED_FOR_ORG]->(org:Organization)
            RETURN org {
              id: org.orgId,
              name: org.name,
              slug: org.normalizedName,
              url: [(org)-[:HAS_WEBSITE]->(website) | website.url][0],
              logo: org.logoUrl,
              hasOwner: CASE WHEN EXISTS((:User)-[:OCCUPIES]->(:OrgUserSeat { seatType: "owner" })<-[:HAS_USER_SEAT]-(org)) THEN true ELSE false END,
              isOwner: CASE WHEN EXISTS((:User {wallet: $wallet})-[:OCCUPIES]->(:OrgUserSeat { seatType: "owner" })<-[:HAS_USER_SEAT]-(org)) THEN true ELSE false END,
              isMember: CASE WHEN EXISTS((:User {wallet: $wallet})-[:OCCUPIES]->(:OrgUserSeat)<-[:HAS_USER_SEAT]-(org)) THEN true ELSE false END,
              credential: run.credential,
              account: run.account
            } as org
          `,
          { wallet },
        );
        const verifications = result.records.map(
          record => new UserVerifiedOrg(record.get("org") as UserVerifiedOrg),
        );
        if (withEcosystemActivations) {
          const workHistory = await this.getUserWorkHistory(wallet);
          if ((workHistory?.wallets?.length ?? 0) > 0) {
            this.logger.log(
              `Fetching verifications for ${wallet} based on ecosystem activations`,
            );
            const mapped: UserVerifiedOrg[] =
              workHistory?.wallets?.flatMap(x =>
                x.ecosystemActivations.map(
                  y =>
                    new UserVerifiedOrg({
                      id: y.id,
                      name: y.name,
                      slug: slugify(y.name),
                      url: "http://ethglobal.com/packs",
                      logo: "http://ethglobal.com",
                      account: x.address,
                      hasOwner: true,
                      isOwner: true,
                      isMember: true,
                      credential: "ecosystemActivation",
                    }),
                ),
              ) ?? [];
            mapped.forEach(x => {
              const exists = verifications.some(y => y.id === x.id);
              if (!exists) {
                verifications.push(x);
              }
            });
          }
        }
        return {
          success: true,
          message: "Retrieved user verifications successfully",
          data: verifications,
        };
      } catch (err) {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "profile.service",
          });
          scope.setExtra("input", { wallet });
          Sentry.captureException(err);
        });
        this.logger.error(
          `ProfileService::getUserVerifications ${err.message}`,
        );
        return {
          success: false,
          message: "Error retrieving user verifications",
        };
      }
    }
  }

  async updateUserVerificationStatus(
    wallet: string,
    status: "PENDING" | "VERIFIED" | "REJECTED",
    timestamp?: number,
  ): Promise<ResponseWithNoData> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet})
        MERGE (user)-[:HAS_VERIFICATION_STATUS]->(status:UserVerificationStatus)
        ON CREATE SET status.id = randomUUID(), status.status = $status, status.verifiedTimestamp = $timestamp
        ON MATCH SET status.status = $status, status.verifiedTimestamp = $timestamp
        RETURN user
      `,
        { wallet, status, timestamp: status === "VERIFIED" ? timestamp : null },
      );
      const user = result.records[0]?.get("user");
      return {
        success: !!user,
        message: user
          ? "User verification status updated successfully"
          : "User not found",
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, status, timestamp });
        Sentry.captureException(error);
      });
      this.logger.error(
        `ProfileService::updateUserVerificationStatus ${error.message}`,
      );
      return {
        success: false,
        message: "Error updating user verification status",
      };
    }
  }

  async getUserVerificationStatus(
    wallet: string,
  ): Promise<ResponseWithOptionalData<UserVerificationStatus>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet})-[r:HAS_VERIFICATION_STATUS]->(status:UserVerificationStatus)
        RETURN status {
          id: status.id,
          status: status.status,
          verifiedTimestamp: status.verifiedTimestamp
        } as status
      `,
        { wallet },
      );
      const status = result.records[0]?.get("status")
        ? new UserVerificationStatus(
            result.records[0]?.get("status") as UserVerificationStatus,
          )
        : undefined;
      return {
        success: !!status,
        message: status
          ? "User verification status retrieved successfully"
          : "User verification status not found",
        data: status,
      };
    } catch (error) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet });
        Sentry.captureException(error);
      });
      this.logger.error(
        `ProfileService::getUserVerificationStatus ${error.message}`,
      );
      return {
        success: false,
        message: "Error getting user verification status",
      };
    }
  }

  async getUserShowCase(
    wallet: string,
  ): Promise<ResponseWithOptionalData<UserShowCase[]>> {
    try {
      const showcases = await this.models.Users.findRelationships({
        alias: "showcases",
        where: { source: { wallet: wallet } },
      });

      return {
        success: true,
        message: "User showcase retrieved successfully",
        data: showcases.map(x =>
          new UserShowCaseEntity(x.target.getDataValues()).getProperties(),
        ),
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::getUserShowCase ${err.message}`);
      return {
        success: false,
        message: "Error getting user showcase",
      };
    }
  }

  async getUserSkills(
    wallet: string,
  ): Promise<ResponseWithOptionalData<UserSkill[]>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
          MATCH (user:User {wallet: $wallet})-[r:HAS_SKILL]->(skill:LegacyTag)
          RETURN skill { .*, canTeach: r.canTeach } as skill
        `,
        { wallet },
      );
      return {
        success: true,
        message: "Retrieved user skills successfully",
        data: uniqBy(
          result.records.map(record =>
            new UserSkillEntity(
              record.get("skill") as UserSkill,
            ).getProperties(),
          ),
          "id",
        ),
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::getUserSkills ${err.message}`);
      return {
        success: false,
        message: "Error getting user skills",
      };
    }
  }

  async updateUserLinkedAccounts(
    wallet: string,
    contact: {
      discord: string | null;
      telegram: string | null;
      twitter: string | null;
      email: string | null;
      farcaster: string | null;
      github: string | null;
      google: string | null;
      apple: string | null;
    },
  ): Promise<ResponseWithNoData> {
    try {
      const profile = data(await this.getUserProfile(wallet));
      this.logger.log(`Updating linked accounts for ${wallet}`);

      if (
        profile?.linkedAccounts.github &&
        (profile?.linkedAccounts.github !== contact.github || !contact.github)
      ) {
        this.logger.log(`Unlinking github user`);
        await this.githubUserService.removeGithubInfoFromUser(wallet);
      }

      if (contact.github) {
        this.logger.log(`Fetching github info for user`);
        const githubUser = axios
          .get<{
            avatar_url: string;
          }>(`https://api.github.com/users/${contact.github}`)
          .catch(err => {
            this.logger.error(`UserService::fetchGithubUser ${err.message}`);
            this.logger.error(err);
            Sentry.withScope(scope => {
              scope.setTags({
                action: "external-api-call",
                source: "user.service",
              });
              Sentry.captureException(err);
            });
            return undefined;
          });

        const result = await this.githubUserService.addGithubInfoToUser({
          wallet,
          githubLogin: contact.github,
          githubAvatarUrl: (await githubUser)?.data?.avatar_url ?? null,
        });
        if (result.success) {
          this.logger.log(`Github info added to user`);
        } else {
          this.logger.error(`Github info not added to user: ${result.message}`);
          return result;
        }
      }
      await this.neogma.queryRunner.run(
        `
          MATCH (user:User {wallet: $wallet})

          WITH user
          MERGE (user)-[:HAS_LINKED_ACCOUNT]->(account: LinkedAccount)
          ON CREATE SET
            account += $dto,
            account.createdTimestamp = timestamp()
          ON MATCH SET
            account += $dto,
            account.updatedTimestamp = timestamp()
        `,
        { wallet, dto: contact },
      );
      return {
        success: true,
        message: "User linked accounts updated successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "profiles.service",
        });
        scope.setExtra("input", { wallet });
        Sentry.captureException(err);
      });
      this.logger.error(
        `ProfileService::updateDevUserLinkedAccounts ${err.message}`,
      );
      return {
        success: false,
        message: "Error updating user linked accounts",
      };
    }
  }

  async updateUserLocationInfo(
    wallet: string,
    dto: UpdateDevLocationInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
          MATCH (user:User {wallet: $wallet})

          WITH user
          MERGE (user)-[:HAS_LOCATION]->(location: UserLocation)
          ON CREATE SET
            location += $location,
            location.createdTimestamp = timestamp()
          ON MATCH SET
            location += $location,
            location.updatedTimestamp = timestamp()
        `,
        { wallet, location: dto },
      );
      return {
        success: true,
        message: "User location info updated successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "profiles.service",
        });
        scope.setExtra("input", { wallet, ...dto });
        Sentry.captureException(err);
      });
      this.logger.error(
        `ProfileService::updateDevUserLocationInfo ${err.message}`,
      );
      return {
        success: false,
        message: "Error updating user location info",
      };
    }
  }

  async updateUserAvailability(
    wallet: string,
    availability: boolean,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet})
        SET user.available = $availableForWork
        SET user.updatedTimestamp = timestamp()

      `,
        {
          wallet,
          availableForWork: availability,
        },
      );

      return {
        success: true,
        message: "User profile updated successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, availability });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::updateUserProfile ${err.message}`);
      return {
        success: false,
        message: "Error updating user profile",
      };
    }
  }

  async updateUserShowCase(
    wallet: string,
    dto: UpdateUserShowCaseInput,
  ): Promise<ResponseWithNoData> {
    try {
      const oldShowcases = await this.models.Users.findRelationships({
        alias: "showcases",
        where: { source: { wallet: wallet } },
      });
      const newShowcases = dto.showcase.map(x => ({ ...x, id: randomUUID() }));
      for (const showcase of oldShowcases) {
        await showcase.target.delete({ detach: true });
      }
      if (newShowcases.length !== 0) {
        await this.models.UserShowcases.createMany(newShowcases, {
          merge: true,
        });
        for (const showcase of newShowcases) {
          await this.models.Users.relateTo({
            alias: "showcases",
            where: {
              source: {
                wallet: wallet,
              },
              target: {
                id: showcase.id,
              },
            },
          });
        }
      }
      return {
        success: true,
        message: "User showcase updated successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, ...dto });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::updateUserShowCase ${err.message}`);
      return {
        success: false,
        message: "Error updating user showcase",
      };
    }
  }

  async updateUserSkills(
    wallet: string,
    dto: UpdateUserSkillsInput,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
          MATCH (user:User {wallet: $wallet})
          OPTIONAL MATCH (user)-[r:HAS_SKILL]->(:LegacyTag)
          DELETE r

          WITH user
          UNWIND $skills as skillData
          WITH skillData, user
          MATCH (skill:LegacyTag {id: skillData.id, normalizedName: skillData.normalizedName})
          MERGE (user)-[r:HAS_SKILL]->(skill:LegacyTag)
          SET r.canTeach = skillData.canTeach
        `,
        {
          wallet,
          skills: dto.skills.map(x => ({
            ...x,
            normalizedName: slugify(x.name),
          })),
        },
      );

      return {
        success: true,
        message: "User skills updated successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, ...dto });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::updateUserSkills ${err.message}`);
      return {
        success: false,
        message: "Error updating user skills",
      };
    }
  }

  async reviewOrgSalary(
    wallet: string,
    dto: ReviewOrgSalaryInput,
  ): Promise<ResponseWithNoData> {
    try {
      const userOrgs = data(await this.getUserVerifications(wallet));
      if (userOrgs?.find(x => x.id === dto.orgId)) {
        await this.neogma.queryRunner.run(
          `
        MATCH (user:User {wallet: $wallet}), (org:Organization {orgId: $orgId})
        MERGE (user)-[:LEFT_REVIEW]->(review:OrgReview)<-[:HAS_REVIEW]-(org)
        SET review.salary = $salary
        SET review.currency = $currency
        SET review.offersTokenAllocation = $offersTokenAllocation
        SET review.reviewedTimestamp = timestamp()
      `,
          { wallet, ...dto },
        );
        return { success: true, message: "Org salary reviewed successfully" };
      } else {
        return {
          success: false,
          message: "You are unauthorized to perform this action",
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, ...dto });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::reviewOrgSalary ${err.message}`);
      return {
        success: false,
        message: "Error reviewing org salary",
      };
    }
  }

  async rateOrg(
    wallet: string,
    dto: RateOrgInput,
  ): Promise<ResponseWithNoData> {
    try {
      const userOrgs = data(await this.getUserVerifications(wallet));
      if (userOrgs?.find(x => x.id === dto.orgId)) {
        await this.neogma.queryRunner.run(
          `
        MATCH (user:User {wallet: $wallet}), (org:Organization {orgId: $orgId})
        MERGE (user)-[:LEFT_REVIEW]->(review:OrgReview)<-[:HAS_REVIEW]-(org)
        SET review.onboarding = $onboarding
        SET review.careerGrowth = $careerGrowth
        SET review.benefits = $benefits
        SET review.workLifeBalance = $workLifeBalance
        SET review.diversityInclusion = $diversityInclusion
        SET review.management = $management
        SET review.product = $product
        SET review.compensation = $compensation
        SET review.reviewedTimestamp = timestamp()
      `,
          { wallet, ...dto },
        );
        return { success: true, message: "Org rated successfully" };
      } else {
        return {
          success: false,
          message: "You are unauthorized to perform this action",
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, ...dto });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::rateOrg ${err.message}`);
      return {
        success: false,
        message: "Error rating org",
      };
    }
  }

  async reviewOrg(
    wallet: string,
    dto: ReviewOrgInput,
  ): Promise<ResponseWithNoData> {
    try {
      const userOrgs = data(await this.getUserVerifications(wallet));
      if (userOrgs?.find(x => x.id === dto.orgId)) {
        await this.neogma.queryRunner.run(
          `
        MATCH (user:User {wallet: $wallet}), (org:Organization {orgId: $orgId})
        MERGE (user)-[:LEFT_REVIEW]->(review:OrgReview)<-[:HAS_REVIEW]-(org)
        SET review.id = randomUUID()
        SET review.title = $title
        SET review.location = $location
        SET review.timezone = $timezone
        SET review.pros = $pros
        SET review.cons = $cons
        SET review.reviewedTimestamp = timestamp()
      `,
          { wallet, ...dto },
        );
        return { success: true, message: "Org reviewed successfully" };
      } else {
        return {
          success: false,
          message: "You are unauthorized to perform this action",
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, ...dto });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::reviewOrg ${err.message}`);
      return {
        success: false,
        message: "Error reviewing org",
      };
    }
  }

  async findReviewById(
    id: string,
  ): Promise<ResponseWithOptionalData<OrgStaffReview>> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (review:OrgReview {id: $id})<-[:HAS_REVIEW]-(:Organization)
        RETURN {
          id: review.id,
          title: review.title,
          location: review.location,
          timezone: review.timezone,
          pros: review.pros,
          cons: review.cons
        } as review
      `,
        { id },
      );
      const review = result?.records[0]?.get("review");

      if (review) {
        return {
          success: true,
          message: "Review verification successful",
          data: new OrgStaffReviewEntity(review).getProperties(),
        };
      } else {
        return {
          success: false,
          message: "Review not found",
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { id });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::verifyOrgReview ${err.message}`);
      return {
        success: false,
        message: "Error verifying org review",
      };
    }
  }

  async updateRepoContribution(
    wallet: string,
    dto: UpdateRepoContributionInput,
  ): Promise<ResponseWithNoData> {
    try {
      const userRepos = (await this.getUserRepos(wallet, {
        limit: Integer.MAX_SAFE_VALUE.toNumber(),
        page: 1,
      })) as Response<UserRepo[]>;
      if (userRepos.data.find(x => x.id === dto.id)) {
        await this.neogma.queryRunner.run(
          `
        MATCH (:User {wallet: $wallet})-[:HAS_GITHUB_USER]->(:GithubUser)-[r:CONTRIBUTED_TO]->(:GithubRepository {id: $id})
        SET r.summary = $contribution
      `,
          { wallet, ...dto },
        );

        return {
          success: true,
          message: "User repo contribution updated successfully",
        };
      } else {
        return {
          success: false,
          message: "You are unauthorized to perform this action",
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, ...dto });
        Sentry.captureException(err);
      });
      this.logger.error(
        `ProfileService::updateRepoContribution ${err.message}`,
      );
      return {
        success: false,
        message: "Error updating user repo contribution",
      };
    }
  }

  async updateRepoTagsUsed(
    wallet: string,
    dto: UpdateRepoTagsUsedInput,
  ): Promise<ResponseWithNoData> {
    try {
      const userRepos = (await this.getUserRepos(wallet, {
        limit: Integer.MAX_SAFE_VALUE.toNumber(),
        page: 1,
      })) as Response<UserRepo[]>;
      if (userRepos.data.find(x => x.id === dto.id)) {
        await this.neogma.queryRunner.run(
          `
        MATCH (user:User {wallet: $wallet})
        MATCH (user)-[:HAS_GITHUB_USER]->(ghu:GithubUser)-[:CONTRIBUTED_TO]->(repo:GithubRepository {id: $id})
        OPTIONAL MATCH (ghu)-[r1:USED_TAG]->(tag:LegacyTag)-[r2:USED_ON]->(repo)
        DETACH DELETE r1,r2

        WITH ghu, user
        UNWIND $tagsUsed as data
        WITH data, ghu, user
        MATCH (repo:GithubRepository {id: $id}), (tag:LegacyTag {normalizedName: data.normalizedName})
        MERGE (user)-[s:HAS_SKILL]->(tag:LegacyTag)
        SET s.canTeach = data.canTeach
        MERGE (ghu)-[:USED_TAG]->(tag)-[:USED_ON]->(repo)
      `,
          { wallet, ...dto },
        );

        return {
          success: true,
          message: "User repo tags used updated successfully",
        };
      } else {
        return {
          success: false,
          message: "You are unauthorized to perform this action",
        };
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, ...dto });
        Sentry.captureException(err);
      });
      this.logger.error(
        `ProfileService::updateRepoContribution ${err.message}`,
      );
      return {
        success: false,
        message: "Error updating user repo tags used",
      };
    }
  }

  async getPrivyId(wallet: string): Promise<string | undefined> {
    const result = await this.neogma.queryRunner
      .run(
        `
          MATCH (u:User {wallet:$wallet})
          RETURN u.privyId as privyId
        `,
        { wallet },
      )
      .then(res =>
        res.records.length ? res.records[0].get("privyId") : undefined,
      )
      .catch(err => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "profile.service",
          });
          Sentry.captureException(err);
        });
        this.logger.error(`ProfileService::getPrivyId ${err.message}`);
        return undefined;
      });
    return result;
  }

  private async getCachedWorkHistory(wallet: string): Promise<
    | {
        username: string | null;
        wallets: {
          address: string;
          ecosystemActivations: EcosystemActivation[];
        }[];
        cryptoNative: boolean;
        workHistory: UserWorkHistory[];
        adjacentRepos: AdjacentRepo[];
      }
    | undefined
  > {
    try {
      const profile = data(await this.getUserProfile(wallet));
      if (profile) {
        const wallets =
          data(
            await this.scorerService.getEcosystemActivationsForWallets(
              profile?.linkedAccounts?.wallets ?? [],
              null,
            ),
          ) ?? [];
        const workHistory = await this.getUserWorkHistoryCache(wallet);
        const adjacentRepos = await this.getUserAdjacentReposCache(wallet);
        return {
          username: profile?.linkedAccounts?.github,
          wallets: wallets.map(x => ({
            address: x.wallet,
            ecosystemActivations: x.ecosystemActivations,
          })),
          cryptoNative: profile?.cryptoNative ?? false,
          workHistory,
          adjacentRepos,
        };
      } else {
        return undefined;
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::getCachedWorkHistory ${err.message}`);
      return undefined;
    }
  }

  async getUserWorkHistory(
    wallet: string,
    bypassCache = false,
  ): Promise<
    | {
        username: string | null;
        wallets: {
          address: string;
          ecosystemActivations: EcosystemActivation[];
        }[];
        cryptoNative: boolean;
        workHistory: UserWorkHistory[];
        adjacentRepos: AdjacentRepo[];
      }
    | undefined
  > {
    try {
      const profile = data(await this.getUserProfile(wallet));
      if (profile) {
        const cacheLock = await this.getUserCacheLock(wallet);
        if (bypassCache || cacheLock <= now()) {
          const workHistory = (
            await this.scorerService.getUserWorkHistories([
              {
                github: profile?.linkedAccounts?.github,
                wallets: profile?.linkedAccounts?.wallets ?? [],
              },
            ])
          )[0];
          const orgs = [];
          const emails = [
            ...profile.alternateEmails,
            profile?.linkedAccounts?.email,
            profile?.linkedAccounts?.google,
          ].filter(Boolean);
          const result = await this.neogma.queryRunner.run(
            `
            MATCH (organization: Organization)-[:HAS_WEBSITE]->(website: Website)
            UNWIND $emails as email
            WITH email, website, organization
            WHERE email IS NOT NULL AND website IS NOT NULL AND apoc.data.url(website.url).host CONTAINS apoc.data.email(email).domain
            RETURN apoc.coll.toSet(COLLECT(organization.orgId)) as orgsByEmail
          `,
            { wallet, emails },
          );
          const orgsByEmail =
            result?.records[0]
              ?.get("orgsByEmail")
              .map(record => record as string) ?? [];
          orgsByEmail.forEach((x: string) => {
            const exists = orgs.some(y => y === x);
            if (!exists) {
              orgs.push(x);
            }
          });

          await this.refreshWorkHistoryCache(
            wallet,
            workHistory?.cryptoNative || orgs.length > 0,
            workHistory?.workHistory ?? [],
            workHistory?.adjacentRepos ?? [],
          );

          await this.refreshUserRepoCache(
            wallet,
            (workHistory?.workHistory ?? []).map(x => {
              const repos = x.repositories.map(repo => ({
                name: repo.name,
                description: repo.description,
              }));
              return {
                login: x.login,
                name: x.name,
                description: x.description,
                avatar_url: x.logoUrl,
                repositories: repos,
              };
            }),
          );

          await this.refreshUserCacheLock([wallet]);
          return workHistory;
        } else {
          return this.getCachedWorkHistory(wallet);
        }
      } else {
        return undefined;
      }
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "service-call",
          source: "profile.service",
        });
        Sentry.captureException(err);
      });
      this.logger.error(`/profile/get-user-work-history: ${err.message}`);
    }
  }

  private async getUserCacheLock(wallet: string): Promise<number | null> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (:User {wallet: $wallet})-[:HAS_CACHE_LOCK]->(lock: UserCacheLock)
        RETURN lock.createdTimestamp as timestamp
      `,
        { wallet },
      );
      return nonZeroOrNull(result.records[0]?.get("timestamp"));
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::getUserCacheLock ${err.message}`);
      return -1;
    }
  }

  private async refreshUserCacheLock(
    wallets: string[],
  ): Promise<number | null> {
    this.logger.log(`Refreshing cache lock for ${wallets.join(", ")}`);
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (user:User WHERE user.wallet IN $wallets)
        OPTIONAL MATCH (user)-[:HAS_CACHE_LOCK]->(lock:UserCacheLock)
        DETACH DELETE lock
        WITH user

        CREATE (lock:UserCacheLock)
        SET lock.createdTimestamp = $newTimestamp

        WITH user, lock
        CREATE (user)-[:HAS_CACHE_LOCK]->(lock)
        RETURN lock.createdTimestamp as timestamp
        `,
        {
          wallets,
          newTimestamp: addDays(
            now(),
            this.configService.get<number>("USER_CACHE_EXPIRATION_IN_DAYS"),
          ).getTime(),
        },
      );
      return intConverter(result.records[0]?.get("timestamp"));
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallets });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::refreshUserCacheLock ${err.message}`);
      return -1;
    }
  }

  private async refreshWorkHistoryCache(
    wallet: string,
    cryptoNative: boolean,
    workHistory: UserWorkHistory[],
    adjacentRepos: AdjacentRepo[],
  ): Promise<ResponseWithNoData> {
    const isCryptoNative = cryptoNative;
    const isCryptoAdjacent = adjacentRepos.length > 0;

    this.logger.log(
      `/profile/refresh-work-history-cache ${JSON.stringify({
        wallet,
        isCryptoNative,
        isCryptoAdjacent,
      })}`,
    );

    const result = await this.neogma
      .getTransaction(null, async tx => {
        await tx.run(
          `
            MATCH (user:User {wallet: $wallet})
            OPTIONAL MATCH (user)-[:HAS_WORK_HISTORY]->(oldHistory: UserWorkHistory)-[:WORKED_ON_REPO]->(oldHistoryRepo: UserWorkHistoryRepo)
            DETACH DELETE oldHistory, oldHistoryRepo

            WITH user
            OPTIONAL MATCH (user)-[:HAS_ADJACENT_REPO]->(oldAdjacentRepo: UserAdjacentRepo)
            DETACH DELETE oldAdjacentRepo
          `,
          { wallet },
        );

        await tx.run(
          `
          MATCH (user:User {wallet: $wallet})
          SET user.cryptoNative = $cryptoNative,
              user.cryptoAdjacent = $cryptoAdjacent

          WITH user
          UNWIND $history AS workHistory

          WITH user, workHistory,
              user.wallet + '::' + workHistory.name AS historyKey

          MERGE (history:UserWorkHistory {compositeKey: historyKey})
          ON CREATE SET history.login = workHistory.login,
              history.name = workHistory.name,
              history.logoUrl = workHistory.logoUrl,
              history.description = workHistory.description,
              history.url = workHistory.url,
              history.firstContributedAt = workHistory.firstContributedAt,
              history.lastContributedAt = workHistory.lastContributedAt,
              history.commitsCount = workHistory.commitsCount,
              history.tenure = workHistory.tenure,
              history.cryptoNative = workHistory.cryptoNative,
              history.createdAt = timestamp()
          ON MATCH SET history.login = workHistory.login,
              history.name = workHistory.name,
              history.logoUrl = workHistory.logoUrl,
              history.description = workHistory.description,
              history.url = workHistory.url,
              history.firstContributedAt = workHistory.firstContributedAt,
              history.lastContributedAt = workHistory.lastContributedAt,
              history.commitsCount = workHistory.commitsCount,
              history.tenure = workHistory.tenure,
              history.cryptoNative = workHistory.cryptoNative,
              history.updatedAt = timestamp()

          MERGE (user)-[:HAS_WORK_HISTORY]->(history)

          WITH history, workHistory

          UNWIND workHistory.repositories AS repo
          WITH history, repo,
              history.compositeKey + '::' + repo.url AS repoKey

          MERGE (historyRepo:UserWorkHistoryRepo {compositeKey: repoKey})
          ON CREATE SET historyRepo.name = repo.name,
              historyRepo.url = repo.url,
              historyRepo.description = repo.description,
              historyRepo.cryptoNative = repo.cryptoNative,
              historyRepo.firstContributedAt = repo.firstContributedAt,
              historyRepo.lastContributedAt = repo.lastContributedAt,
              historyRepo.commitsCount = repo.commitsCount,
              historyRepo.skills = repo.skills,
              historyRepo.tenure = repo.tenure,
              historyRepo.stars = repo.stars,
              historyRepo.createdAt = timestamp()
          ON MATCH SET historyRepo.name = repo.name,
              historyRepo.url = repo.url,
              historyRepo.description = repo.description,
              historyRepo.cryptoNative = repo.cryptoNative,
              historyRepo.firstContributedAt = repo.firstContributedAt,
              historyRepo.lastContributedAt = repo.lastContributedAt,
              historyRepo.commitsCount = repo.commitsCount,
              historyRepo.skills = repo.skills,
              historyRepo.tenure = repo.tenure,
              historyRepo.stars = repo.stars,
              historyRepo.updatedAt = timestamp()

          MERGE (history)-[:WORKED_ON_REPO]->(historyRepo)
          `,
          {
            wallet,
            history: workHistory ?? [],
            cryptoNative: isCryptoNative,
            cryptoAdjacent: isCryptoAdjacent,
          },
        );

        await tx.run(
          `
            MATCH (user: User {wallet: $wallet})
            UNWIND $adjacentRepos as adjacentRepo
            MERGE (repo: UserAdjacentRepo)

            ON CREATE SET repo.login = adjacentRepo.login,
              repo.name = adjacentRepo.name,
              repo.url = adjacentRepo.url,
              repo.description = adjacentRepo.description,
              repo.createdAt = timestamp()
            ON MATCH SET repo.login = adjacentRepo.login,
              repo.name = adjacentRepo.name,
              repo.url = adjacentRepo.url,
              repo.description = adjacentRepo.description,
              repo.updatedAt = timestamp()

            WITH repo, user
            MERGE (user)-[:HAS_ADJACENT_REPO]->(repo)
          `,
          { wallet, adjacentRepos },
        );
      })
      .then(() => true)
      .catch((err: Error) => {
        Sentry.withScope(scope => {
          scope.setTags({
            action: "db-call",
            source: "profile.service",
          });
          scope.setExtra("input", { wallet, dto: workHistory });
          Sentry.captureException(err);
        });
        this.logger.error(
          `ProfileService::refreshWorkHistoryCache ${err.message}`,
        );
        return false;
      });

    return {
      success: result,
      message: result
        ? "Persisted user work history successfully"
        : "Error caching work history",
    };
  }

  private async refreshUserRepoCache(
    wallet: string,
    dto: UserGithubOrganization[],
  ): Promise<ResponseWithNoData> {
    try {
      for (const org of dto) {
        const processed = {
          ...org,
          repositories: org.repositories.map(repo => ({
            ...repo,
            nameWithOwner: `${org.login}/${repo.name}`,
          })),
        };
        await this.neogma.queryRunner.run(
          `
            MATCH (user:User {wallet: $wallet})-[:HAS_GITHUB_USER]->(ghu:GithubUser)
            
            UNWIND $org.repositories as orgRepo
            MERGE (repo: GithubRepository {nameWithOwner: orgRepo.nameWithOwner})
            ON CREATE SET
              repo.id = randomUUID(),
              repo.name = orgRepo.name,
              repo.nameWithOwner = orgRepo.nameWithOwner,
              repo.description = orgRepo.description,
              repo.createdTimestamp = timestamp(),
              repo.updatedTimestamp = timestamp()
            ON MATCH SET
              repo.description = orgRepo.description,
              repo.updatedTimestamp = timestamp()
            
            WITH repo,ghu
            MERGE (ghu)-[:CONTRIBUTED_TO]->(repo)
            
            WITH repo
            MATCH (gho:GithubOrganization {login: $org.login})
            MERGE (gho)-[:HAS_REPOSITORY]->(repo)
          `,
          { wallet, org: { ...processed } },
        );
        await this.neogma.queryRunner.run(
          `
            MATCH (user:User {wallet: $wallet})-[:HAS_GITHUB_USER]->(ghu:GithubUser)
            OPTIONAL MATCH (ghu)-[r:CONTRIBUTED_TO]->(repo: GithubRepository WHERE NOT repo.nameWithOwner IN $repos)
            DETACH DELETE r
          `,
          { wallet, repos: processed.repositories.map(x => x.nameWithOwner) },
        );
      }
      return {
        success: true,
        message: "Persisted user repos successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, dto });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::refreshUserRepoCache ${err.message}`);
      return {
        success: false,
        message: "Error caching user repos",
      };
    }
  }

  async blockOrgJobs(
    wallet: string,
    orgId: string,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet}), (org:Organization {orgId: $orgId})
        MERGE (user)-[r:BLOCKED_ORG_JOBS]->(org)
        SET r.createdTimestamp = timestamp()
      `,
        { wallet, orgId },
      );
      return { success: true, message: "Org jobs blocked successfully" };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, orgId });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::blockOrgJobs ${err.message}`);
      return {
        success: false,
        message: "Error blocking org jobs",
      };
    }
  }

  async logApplyInteraction(
    wallet: string,
    shortUUID: string,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet}), (job:StructuredJobpost {shortUUID: $shortUUID})
        MERGE (user)-[r:APPLIED_TO]->(job)
        SET r.createdTimestamp = timestamp()
      `,
        { wallet, shortUUID },
      );
      return {
        success: true,
        message: "Logged application to job successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, shortUUID });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::logApplyInteraction ${err.message}`);
      return {
        success: false,
        message: "Failed to log application to job",
      };
    }
  }

  async verifyApplyInteraction(
    wallet: string,
    shortUUID: string,
  ): Promise<boolean> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet}), (job:StructuredJobpost {shortUUID: $shortUUID})
        RETURN EXISTS((user)-[:APPLIED_TO]->(job)) AS hasApplied
      `,
        { wallet, shortUUID },
      );
      return result.records[0]?.get("hasApplied") as boolean;
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, shortUUID });
        Sentry.captureException(err);
      });
      this.logger.error(
        `ProfileService::verifyApplyInteraction ${err.message}`,
      );
      return false;
    }
  }

  async logBookmarkInteraction(
    wallet: string,
    shortUUID: string,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet}), (job:StructuredJobpost {shortUUID: $shortUUID})
        MERGE (user)-[r:BOOKMARKED]->(job)
        SET r.createdTimestamp = timestamp()
      `,
        { wallet, shortUUID },
      );
      return {
        success: true,
        message: "Bookmarked job successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, shortUUID });
        Sentry.captureException(err);
      });
      this.logger.error(
        `ProfileService::logBookmarkInteraction ${err.message}`,
      );
      return {
        success: false,
        message: "Failed to bookmark job",
      };
    }
  }

  async verifyBookmarkInteraction(
    wallet: string,
    shortUUID: string,
  ): Promise<boolean> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet}), (job:StructuredJobpost {shortUUID: $shortUUID})
        RETURN EXISTS((user)-[:BOOKMARKED]->(job)) as isBookmarked
      `,
        { wallet, shortUUID },
      );
      return result.records[0]?.get("isBookmarked") as boolean;
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, shortUUID });
        Sentry.captureException(err);
      });
      this.logger.error(
        `ProfileService::verifyBookmarkInteraction ${err.message}`,
      );
      return false;
    }
  }

  async removeBookmarkInteraction(
    wallet: string,
    shortUUID: string,
  ): Promise<ResponseWithNoData> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet}), (job:StructuredJobpost {shortUUID: $shortUUID})
        MATCH (user)-[r:BOOKMARKED]->(job)
        DELETE r
      `,
        { wallet, shortUUID },
      );
      return {
        success: true,
        message: "Unbookmarked job successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, shortUUID });
        Sentry.captureException(err);
      });
      this.logger.error(
        `ProfileService::removeBookmarkInteraction ${err.message}`,
      );
      return {
        success: false,
        message: "Failed to unbookmark job",
      };
    }
  }

  async logViewDetailsInteraction(
    wallet: string,
    shortUUID: string,
  ): Promise<void> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet}), (job:StructuredJobpost {shortUUID: $shortUUID})
        MERGE (user)-[r:VIEWED_DETAILS]->(job)
        SET r.createdTimestamp = timestamp()
      `,
        { wallet, shortUUID },
      );
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, shortUUID });
        Sentry.captureException(err);
      });
      this.logger.error(
        `ProfileService::logViewDetailsInteraction ${err.message}`,
      );
    }
  }

  async logSearchInteraction(wallet: string, query: string): Promise<void> {
    try {
      await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet})
        MERGE (user)-[r:DID_SEARCH]->(:SearchHistory {query: $query})
        SET r.createdTimestamp = timestamp()
      `,
        { wallet, query },
      );
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet, query });
        Sentry.captureException(err);
      });
      this.logger.error(`ProfileService::logSearchInteraction ${err.message}`);
    }
  }

  async getUserWorkHistoryCache(wallet: string): Promise<UserWorkHistory[]> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet})-[:HAS_WORK_HISTORY]->(workHistory:UserWorkHistory)
        RETURN workHistory {
          .*,
          repositories: [(workHistory)-[:WORKED_ON_REPO]->(repo:UserWorkHistoryRepo) | repo {.*}]
        } as history
        `,
        { wallet },
      );

      return result.records
        .map(record =>
          new UserWorkHistoryEntity(record.get("history")).getProperties(),
        )
        .filter(x => x.name);
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet });
        Sentry.captureException(err);
      });
      this.logger.error(
        `ProfileService::getUserWorkHistoryCache ${err.message}`,
      );
      return undefined;
    }
  }

  async getUserAdjacentReposCache(wallet: string): Promise<AdjacentRepo[]> {
    try {
      const result = await this.neogma.queryRunner.run(
        `
        MATCH (user:User {wallet: $wallet})-[:HAS_ADJACENT_REPO]->(repo:UserAdjacentRepo)
        RETURN repo {.*} as repo
        `,
        { wallet },
      );

      return result.records.map(record => record.get("repo"));
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "profile.service",
        });
        scope.setExtra("input", { wallet });
        Sentry.captureException(err);
      });
      this.logger.error(
        `ProfileService::getUserAdjacentReposCache ${err.message}`,
      );
      return [];
    }
  }
}
