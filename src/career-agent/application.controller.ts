import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { Response } from "express";
import { PBACGuard } from "src/auth/pbac.guard";
import { Permissions, Session } from "src/shared/decorators";
import { CheckWalletPermissions } from "src/shared/constants";
import { SessionObject } from "src/shared/interfaces";
import { ApplicationService } from "./application.service";
import {
  ExportInput,
  AnswerQuestionInput,
  PrepareInput,
  EditDraftInput,
  SaveCvInput,
} from "./application.dto";
import { CandidateUploadOriginGuard } from "./candidate-documents.controller";
@Controller("profile/applications")
@UseGuards(PBACGuard)
@Permissions(CheckWalletPermissions.USER)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class ApplicationController {
  constructor(private readonly applications: ApplicationService) {}
  @Get("cvs") cvs(
    @Session() s: SessionObject,
  ): ReturnType<ApplicationService["cvs"]> {
    return this.applications.cvs(s.address);
  }
  @Get("cvs/:id/pdf") async downloadCv(
    @Session() s: SessionObject,
    @Param("id", ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const bytes = await this.applications.downloadCv(s.address, id);
    res
      .set({
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="Career CV.pdf"',
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      })
      .send(bytes);
  }
  @Post("cvs") saveCv(
    @Session() s: SessionObject,
    @Body() input: SaveCvInput,
  ): ReturnType<ApplicationService["saveCv"]> {
    return this.applications.saveCv(s.address, input);
  }
  @Get("documents") documents(
    @Session() s: SessionObject,
  ): ReturnType<ApplicationService["documents"]> {
    return this.applications.documents(s.address);
  }
  @Post("prepare") prepare(
    @Session() s: SessionObject,
    @Body() input: PrepareInput,
  ): ReturnType<ApplicationService["prepare"]> {
    return this.applications.prepare(s.address, input);
  }
  @Post("documents/:id/edit")
  @UseGuards(CandidateUploadOriginGuard)
  edit(
    @Session() s: SessionObject,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: EditDraftInput,
  ): ReturnType<ApplicationService["edit"]> {
    return this.applications.edit(s.address, id, input);
  }
  @Post("documents/:id/questions/:questionId/answer")
  @UseGuards(CandidateUploadOriginGuard)
  answerQuestion(
    @Session() s: SessionObject,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("questionId", ParseUUIDPipe) questionId: string,
    @Body() input: AnswerQuestionInput,
  ): ReturnType<ApplicationService["answerQuestion"]> {
    return this.applications.answerQuestion(s.address, id, questionId, input);
  }
  @Post("documents/:id/export") export(
    @Session() s: SessionObject,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: ExportInput,
  ): ReturnType<ApplicationService["export"]> {
    return this.applications.export(s.address, id, input);
  }
  @Get("exports") exports(
    @Session() s: SessionObject,
  ): ReturnType<ApplicationService["exports"]> {
    return this.applications.exports(s.address);
  }
  @Get("exports/:id") async download(
    @Session() s: SessionObject,
    @Param("id", ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.applications.download(s.address, id);
    res
      .set({
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${file.filename}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      })
      .send(file.bytes);
  }
  @Get("exports/:id/provenance") provenance(
    @Session() s: SessionObject,
    @Param("id", ParseUUIDPipe) id: string,
  ): ReturnType<ApplicationService["provenance"]> {
    return this.applications.provenance(s.address, id);
  }
  @Get("documents/:id/revisions") revisions(
    @Session() s: SessionObject,
    @Param("id", ParseUUIDPipe) id: string,
  ): ReturnType<ApplicationService["revisions"]> {
    return this.applications.revisions(s.address, id);
  }
}
