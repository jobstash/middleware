import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { GrantsService } from "./grants.service";
import { RBACGuard } from "src/auth/rbac.guard";
import { CheckWalletRoles } from "src/shared/constants";
import { Roles } from "src/shared/decorators";
import {
  ApiOkResponse,
  ApiUnprocessableEntityResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import { responseSchemaWrapper } from "src/shared/helpers";
import {
  Grant,
  Grantee,
  GranteeDetails,
  GrantListResult,
  PaginatedData,
  ResponseWithNoData,
  ResponseWithOptionalData,
} from "src/shared/interfaces";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { MailService } from "src/mail/mail.service";
import { ConfigService } from "@nestjs/config";
import * as Sentry from "@sentry/node";

@Controller("grants")
export class GrantsController {
  private logger = new CustomLogger(GrantsController.name);
  constructor(
    private readonly grantsService: GrantsService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
  ) {}

  @Get("")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ANON)
  @ApiOkResponse({
    description: "Returns a list of all grants",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Grant),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong fetching the grants from the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async findAll(
    @Query("page") page = 1,
    @Query("limit") limit = 20,
  ): Promise<PaginatedData<GrantListResult>> {
    this.logger.log(`/grants/list ${JSON.stringify({ page, limit })}`);
    return this.grantsService.getGrantsList(page, limit);
  }

  @Get(":slug")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ANON)
  @ApiOkResponse({
    description: "Returns the details of the grant with the passed slug",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(GrantListResult),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong fetching the grant from the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async findOne(
    @Param("slug") slug: string,
  ): Promise<ResponseWithOptionalData<GrantListResult>> {
    this.logger.log(`/grants/${slug}`);
    return this.grantsService.getGrantBySlug(slug).then(res => {
      return res
        ? {
            success: true,
            message: "Grant retrieved successfully",
            data: res,
          }
        : {
            success: false,
            message: "Grant not found",
          };
    });
  }

  @Get(":slug/grantees")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ANON)
  @ApiOkResponse({
    description: "Returns the grantees of the grant with the passed slug",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(GrantListResult),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong fetching the grant from the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async findGrantees(
    @Param("slug") slug: string,
    @Query("page") page = 1,
    @Query("limit") limit = 20,
  ): Promise<PaginatedData<Grantee>> {
    this.logger.log(
      `/grants/${slug}/grantees ${JSON.stringify({ page, limit })}`,
    );
    return this.grantsService.getGranteesBySlug(slug, page, limit);
  }

  @Get(":slug/grantees/:granteeSlug")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ANON)
  @ApiOkResponse({
    description: "Returns the details of the grantee with the passed slug",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(GrantListResult),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong fetching the grant from the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async findGranteesDetails(
    @Param("slug") slug: string,
    @Param("granteeSlug") granteeSlug: string,
  ): Promise<ResponseWithOptionalData<GranteeDetails>> {
    this.logger.log(`/grants/${slug}/grantees/${granteeSlug}`);
    return this.grantsService.getGranteeDetailsBySlugs(slug, granteeSlug);
  }

  @Post("query")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ANON)
  @ApiOkResponse({
    description: "Returns a list of grants that match the query",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(GrantListResult),
    }),
  })
  async query(
    @Body("query") query: string,
    @Query("page") page = 1,
    @Query("limit") limit = 20,
  ): Promise<Promise<PaginatedData<GrantListResult>>> {
    this.logger.log(`/grants/query ${JSON.stringify({ page, limit })}`);
    return this.grantsService.query(query, page, limit);
  }

  @Post("mail")
  @UseGuards(RBACGuard)
  @Roles(CheckWalletRoles.ANON)
  @ApiOkResponse({
    description: "Sends an email to the admin",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async sendMail(
    @Body("email") email: string,
    @Body("company") company: string,
    @Body("role") role: string,
  ): Promise<ResponseWithNoData> {
    try {
      await this.mailService.sendEmail({
        from: this.configService.getOrThrow<string>("EMAIL"),
        to: this.configService.getOrThrow<string>("ADMIN_EMAIL"),
        subject: `New interested company - ${company}`,
        text: `Hello Admin,

      A ${role} at a company, ${company} has expressed an interest in Ecosystem.vision.

      Stay Frosty,
      Bill Harder,
      JobStash.xyz`,
      });
      return {
        success: true,
        message: "Email sent successfully",
      };
    } catch (err) {
      Sentry.withScope(scope => {
        scope.setTags({
          action: "db-call",
          source: "grants.service",
        });
        Sentry.captureException(err);
      });
      return {
        success: false,
        message: "Error sending email",
      };
    }
  }
}
