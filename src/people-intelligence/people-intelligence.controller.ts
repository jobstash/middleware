import {
  Controller,
  Get,
  GoneException,
  Param,
  Query,
  Res,
  UseInterceptors,
} from "@nestjs/common";
import { ApiOkResponse } from "@nestjs/swagger";
import { CacheHeaderInterceptor } from "src/shared/decorators/cache-interceptor.decorator";
import { PeopleIntelligenceService } from "./people-intelligence.service";
import {
  DeveloperReport,
  PeopleActivityMap,
  PeopleAtlasFrame,
  PeopleOverview,
} from "./people-intelligence.types";
import { Response } from "express";

type PublicQuery = Record<string, string | number | boolean | undefined>;

@Controller("people")
@UseInterceptors(new CacheHeaderInterceptor({ mode: "revalidate-always" }))
export class PeopleIntelligenceController {
  constructor(private readonly people: PeopleIntelligenceService) {}

  @Get("overview")
  @ApiOkResponse({ description: "Ecosystem-wide People activity series" })
  overview(@Query() query: PublicQuery): Promise<PeopleOverview> {
    return this.people.overview(query);
  }

  @Get("developer-report")
  @ApiOkResponse({
    description:
      "Developer ecosystem report with one report-wide historical range",
  })
  developerReport(@Query() query: PublicQuery): Promise<DeveloperReport> {
    return this.people.developerReport(query);
  }

  @Get("activity-map")
  @ApiOkResponse({ description: "Virtualized organization-by-time rows" })
  activityMap(@Query() query: PublicQuery): Promise<PeopleActivityMap> {
    return this.people.activityMap(query);
  }

  @Get("atlas")
  @ApiOkResponse({ description: "Navigable organization movement timeline" })
  atlas(@Query() query: PublicQuery): Promise<PeopleAtlasFrame> {
    return this.people.atlas(query);
  }

  @Get("directory")
  @ApiOkResponse({ description: "Gone: individual directory was removed" })
  directory(@Res({ passthrough: true }) response: Response): never {
    return this.identityGone(response);
  }

  @Get(":login")
  @ApiOkResponse({ description: "Gone: individual profiles were removed" })
  profile(
    @Param("login") _login: string,
    @Res({ passthrough: true }) response: Response,
  ): never {
    return this.identityGone(response);
  }

  private identityGone(response: Response): never {
    response.setHeader(
      "Cache-Control",
      "no-cache, private, no-store, must-revalidate",
    );
    response.setHeader("Pragma", "no-cache");
    response.setHeader("Expires", "0");
    response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    throw new GoneException({
      statusCode: 410,
      message: "This individual-developer resource is no longer available",
      error: "Gone",
    });
  }
}
