import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { HacksService } from "./hacks.service";
import { CreateHackDto } from "./dto/create-hack.dto";
import { UpdateHackDto } from "./dto/update-hack.dto";
import { Request, Response as ExpressResponse } from "express";
import { AuthService } from "src/auth/auth.service";
import { CustomLogger } from "src/shared/utils/custom-logger";
import { Hack, Response, ResponseWithNoData } from "src/shared/interfaces";
import { PBACGuard } from "src/auth/pbac.guard";
import { Permissions } from "src/shared/decorators";
import { CheckWalletPermissions } from "src/shared/constants";
import {
  ApiOkResponse,
  ApiUnprocessableEntityResponse,
  getSchemaPath,
} from "@nestjs/swagger";
import { responseSchemaWrapper } from "src/shared/helpers";

@Controller("hacks")
export class HacksController {
  private logger = new CustomLogger(HacksController.name);
  constructor(
    private readonly hacksService: HacksService,
    private readonly authService: AuthService,
  ) {}

  @Post()
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  @ApiOkResponse({
    description: "Creates an hack and relates it to a project",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Hack),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong creating the hack on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async create(
    @Req() req: Request,
    @Res({ passthrough: true }) res: ExpressResponse,
    @Body() createHackDto: CreateHackDto,
  ): Promise<Response<Hack> | ResponseWithNoData> {
    const { address } = await this.authService.getSession(req, res);
    return this.hacksService.create(address, createHackDto);
  }

  @Get()
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  @ApiOkResponse({
    description: "Returns a list of all hacks",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Hack),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong fetching the hacks on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async findAll(): Promise<Response<Hack[]> | ResponseWithNoData> {
    return this.hacksService.findAll();
  }

  @Get(":id")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  @ApiOkResponse({
    description: "Fetches an existing hack",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Hack),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong fetching the hack on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async findOne(
    @Param("id") id: string,
  ): Promise<Response<Hack> | ResponseWithNoData> {
    return this.hacksService.findOne(id);
  }

  @Patch(":id")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  @ApiOkResponse({
    description: "Updates an existing hack",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Hack),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong updating the hack on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async update(
    @Param("id") id: string,
    @Body() updateHackDto: UpdateHackDto,
  ): Promise<Response<Hack> | ResponseWithNoData> {
    return this.hacksService.update(id, updateHackDto);
  }

  @Delete(":id")
  @UseGuards(PBACGuard)
  @Permissions(CheckWalletPermissions.SUPER_ADMIN)
  @ApiOkResponse({
    description: "Deletes an hack and detaches it from its project",
    schema: responseSchemaWrapper({
      $ref: getSchemaPath(Hack),
    }),
  })
  @ApiUnprocessableEntityResponse({
    description:
      "Something went wrong deleting the hack on the destination service",
    schema: responseSchemaWrapper({ type: "string" }),
  })
  async remove(@Param("id") id: string): Promise<ResponseWithNoData> {
    return this.hacksService.remove(id);
  }
}
