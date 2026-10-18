import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
  BadRequestException,
} from "@nestjs/common";
import {
  IsUUID,
  IsOptional,
  IsIn,
  IsString,
  MinLength,
  MaxLength,
} from "class-validator";
import { PBACGuard } from "src/auth/pbac.guard";
import { Permissions, Session } from "src/shared/decorators";
import { CheckWalletPermissions } from "src/shared/constants";
import { SessionObject } from "src/shared/interfaces";
import { PageInput } from "./career.dto";
import { screeningMetrics } from "./job-screening";
import { ScreeningService } from "./screening.service";
import { ScreeningPreferencesInput } from "./screening-preferences";
class ScreeningPageInput extends PageInput {
  @IsOptional()
  @IsIn([...screeningMetrics, "overall_score", "evidence_coverage"])
  sort?: string;
  @IsOptional() @IsIn(["asc", "desc"]) direction?: "asc" | "desc";
  @IsOptional() @IsUUID() run?: string;
}
class CategoryInput {
  @IsString() @MinLength(1) @MaxLength(120) classification: string;
  @IsOptional() @IsUUID() run?: string;
}
class StartScreeningInput {
  @IsUUID() connectionId: string;
}
@Controller("profile/career/screening")
@UseGuards(PBACGuard)
@Permissions(CheckWalletPermissions.USER)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class ScreeningController {
  constructor(private readonly screening: ScreeningService) {}
  @Get("preferences") preferences(
    @Session() { address }: SessionObject,
  ): ReturnType<ScreeningService["preferences"]> {
    return this.screening.preferences(address);
  }
  @Post("preferences") savePreferences(
    @Session() { address }: SessionObject,
    @Body() input: ScreeningPreferencesInput,
  ): ReturnType<ScreeningService["savePreferences"]> {
    return this.screening.savePreferences(address, input);
  }
  @Get(":documentId") status(
    @Session() { address }: SessionObject,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Query() page: ScreeningPageInput,
  ): ReturnType<ScreeningService["status"]> {
    return this.screening.status(
      address,
      documentId,
      page.page,
      page.limit,
      page.run,
      page.sort,
      page.direction,
    );
  }
  @Get(":documentId/category") category(
    @Session() { address }: SessionObject,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Query() input: CategoryInput,
  ): ReturnType<ScreeningService["category"]> {
    return this.screening.category(
      address,
      documentId,
      input.classification,
      input.run,
    );
  }
  @Post(":documentId/start") start(
    @Session() { address }: SessionObject,
    @Param("documentId", ParseUUIDPipe) documentId: string,
    @Body() input: StartScreeningInput,
  ): ReturnType<ScreeningService["start"]> {
    return this.screening.start(address, documentId, input.connectionId);
  }
  @Post("runs/:id/:action") control(
    @Session() { address }: SessionObject,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("action") action: string,
  ): ReturnType<ScreeningService["control"]> {
    if (action !== "pause" && action !== "resume")
      throw new BadRequestException("Invalid action");
    return this.screening.control(address, id, action);
  }
}
