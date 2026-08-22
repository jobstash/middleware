import { Controller, Get, Header, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiProperty } from "@nestjs/swagger";
import { PBACGuard } from "src/auth/pbac.guard";
import {
  CANONICAL_JOB_CLASSIFICATIONS,
  CheckWalletPermissions,
} from "src/shared/constants";
import { Permissions } from "src/shared/decorators";

class JobClassificationOutput {
  @ApiProperty()
  code: string;

  @ApiProperty()
  label: string;

  @ApiProperty()
  filterKey: string;

  @ApiProperty()
  pillarSlug: string;
}

@Controller("job-classifications")
export class JobClassificationsController {
  @Get()
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  @Header("Cache-Control", "public, max-age=300, s-maxage=3600")
  @ApiOkResponse({
    description: "The complete canonical Jobpost classification catalog",
    type: [JobClassificationOutput],
  })
  list(): {
    success: true;
    message: string;
    data: typeof CANONICAL_JOB_CLASSIFICATIONS;
  } {
    return {
      success: true,
      message: "Job classifications retrieved successfully",
      data: CANONICAL_JOB_CLASSIFICATIONS,
    };
  }
}
