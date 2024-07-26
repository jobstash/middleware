import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { UserService } from "./user.service";
import { Roles } from "src/shared/decorators";
import { RBACGuard } from "src/auth/rbac.guard";
import { CheckWalletFlows, CheckWalletRoles } from "src/shared/constants";
import {
  DevUserProfile,
  OrgUserProfile,
  ResponseWithNoData,
  UserProfile,
  data,
} from "src/shared/interfaces";
import { AuthorizeOrgApplicationInput } from "./dto/authorize-org-application.dto";
import { MailService } from "src/mail/mail.service";
import { ConfigService } from "@nestjs/config";
import { GetAvailableDevsInput } from "./dto/get-available-devs.input";
import { AuthService } from "src/auth/auth.service";
import { Request, Response } from "express";
import { ApiKeyGuard } from "src/auth/api-key.guard";
import { ApiOkResponse } from "@nestjs/swagger";
import { UserWorkHistory } from "src/shared/interfaces/user/user-work-history.interface";
import { ProfileService } from "src/auth/profile/profile.service";
import { JobsService } from "src/jobs/jobs.service";
import { ScorerService } from "src/scorer/scorer.service";
import { AddUserNoteInput } from "./dto/add-user-note.dto";

@Controller("users")
export class UserController {
  private logger = new CustomLogger(UserController.name);
  constructor(
    private readonly authService: AuthService,
    private readonly userService: UserService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly jobsService: JobsService,
    private readonly profileService: ProfileService,
    private readonly scorerService: ScorerService,
  ) {}

  @Get("")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  async getAllUsers(): Promise<UserProfile[]> {
    this.logger.log("/users");
    return this.userService.findAll();
  }

  @Get("devs/available")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN, CheckWalletRoles.ORG)
  async getDevsAvailableForWork(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Query(new ValidationPipe({ transform: true }))
    params: GetAvailableDevsInput,
  ): Promise<DevUserProfile[]> {
    const { address } = await this.authService.getSession(req, res);
    const orgId = address
      ? await this.userService.findOrgIdByWallet(address as string)
      : null;
    this.logger.log(`/users/devs/available ${JSON.stringify(params)}`);
    return this.userService.getDevsAvailableForWork(params, orgId);
  }

  @Get("orgs/pending")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  async getOrgsAwaitingApproval(): Promise<OrgUserProfile[]> {
    this.logger.log("/users/orgs/pending");
    return this.userService.getOrgsAwaitingApproval();
  }

  @Get("orgs/approved")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  async getApprovedOrgs(): Promise<OrgUserProfile[]> {
    this.logger.log("/users/orgs/approved");
    return this.userService.getApprovedOrgs();
  }

  @Post("orgs/authorize")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ADMIN)
  async authorizeOrgApplication(
    @Body() body: AuthorizeOrgApplicationInput,
  ): Promise<ResponseWithNoData> {
    const { wallet, verdict, orgId } = body;
    this.logger.log(`/users/orgs/authorize ${wallet}`);
    const org = await this.userService.findProfileByWallet(wallet);

    if (org) {
      if (verdict === "approve") {
        if (orgId) {
          const result = await this.userService.authorizeUserForOrg(
            wallet as string,
            orgId,
          );
          if (!result.success) {
            return result;
          }
          const applicants = data(
            await this.jobsService.getJobsByOrgIdWithApplicants(orgId, "all"),
          );
          if (applicants?.length > 0) {
            await this.profileService.refreshUserCacheLock(
              Array.from(
                new Set(
                  applicants
                    .map(applicant => applicant.user.wallet)
                    .filter(Boolean),
                ),
              ),
            );
            const applicantUsernames = Array.from(
              new Set(applicants.map(x => x.user.username).filter(Boolean)),
            );
            const applicantWorkHistories =
              await this.scorerService.getWorkHistory(applicantUsernames);
            const leanStats = await this.scorerService.getLeanStats(
              applicants.map(x => ({
                github: x.user.username,
                wallets: x.user.linkedWallets,
              })),
            );
            for (const applicant of applicantUsernames) {
              const workHistory =
                applicantWorkHistories.find(x => x.user === applicant)
                  ?.workHistory ?? [];
              const leanStatsForApplicant =
                leanStats.find(x => x.actor_login === applicant) ?? null;
              await this.profileService.refreshWorkHistoryCache(
                applicants.find(x => x.user.username === applicant)?.user
                  ?.wallet,
                workHistory,
                leanStatsForApplicant,
              );
            }
          }
        } else {
          return {
            success: false,
            message: "Org must be included if the verdict is approved",
          };
        }
      }
      if (org.email) {
        await this.userService.setWalletFlow({
          flow:
            verdict === "approve"
              ? CheckWalletFlows.ORG_COMPLETE
              : CheckWalletFlows.ORG_REJECTED,
          wallet: wallet,
        });
        await this.mailService.sendEmail({
          from: this.configService.getOrThrow<string>("EMAIL"),
          to: org.email,
          subject: "Application Review Outcome",
          text:
            verdict === "approve"
              ? `
          Good Day,

          I hope this email finds you well. We appreciate your interest in our crypto job aggregator service and your recent application for inclusion in our platform. After a thorough review of your application, we are pleased to inform you that your organization has been approved.

          We believe that your company's commitment to the crypto industry aligns well with our mission, and we are excited to showcase your job opportunities on our platform. Your organization will now be featured alongside other prominent players in the field, providing greater visibility to your job listings.

          We will proceed with the necessary steps to integrate your job postings into our system. Our team will be in touch with you shortly to guide you through the onboarding process and answer any questions you may have.

          Thank you for choosing our crypto job aggregator service. We look forward to a successful collaboration and helping you connect with top talent in the crypto space.

          Best regards,

          Bill Hader
          Organization Review Lead
          JobStash.xyz
          `
              : `
          Dear $RECRUITER,

          I wanted to take a moment to express my appreciation for taking the time to apply as an organization at JobStash. We received a lot of interest, and we were impressed with your desire to contribute.

          However, after careful consideration, we have decided to move forward with another candidate from another organization whose qualifications more closely match our needs. I know this news may be disappointing, but please know that we appreciated your interest in our platform and enjoyed getting to know you during the review process.

          We wish you all the best in your talent search and hope that you will find the perfect opportunity to utilize your skills and expertise. If any new openings arise in the future, we will keep your profile in mind.

          Thank you again for your time and for considering hiring with us.

          Best regards,

          Bill Harder
          Organization Review Lead
          JobStash.xyz
          `,
        });
      }
      return {
        success: true,
        message: `Org ${
          verdict === "approve" ? "approved" : "rejected"
        } successfully`,
      };
    } else {
      return {
        success: false,
        message: "Org not found for that wallet",
      };
    }
  }

  @Get("/work-history")
  @UseGuards(ApiKeyGuard)
  @ApiOkResponse({
    description: "Returns the work history for the passed github accounts ",
    type: Array<{
      user: string;
      workHistory: UserWorkHistory[];
    }>,
  })
  async getWorkHistory(
    @Query("users") users: string,
  ): Promise<{ user: string; workHistory: UserWorkHistory[] }[]> {
    this.logger.log(`/users/work-history ${JSON.stringify(users.split(","))}`);
    return this.scorerService.getWorkHistory(users.split(","));
  }

  @Post("devs/note")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ORG)
  async addUserNote(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body() body: AddUserNoteInput,
  ): Promise<ResponseWithNoData> {
    const { address } = await this.authService.getSession(req, res);
    if (address) {
      const orgId = address
        ? await this.userService.findOrgIdByWallet(address as string)
        : null;
      this.logger.log(`/users/devs/note ${JSON.stringify(body)}`);
      return this.userService.addUserNote(body.wallet, body.note, orgId);
    } else {
      return {
        success: false,
        message: "Access denied",
      };
    }
  }
}
