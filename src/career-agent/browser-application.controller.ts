import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Res, UseGuards, UsePipes, ValidationPipe } from "@nestjs/common";
import { Response } from "express";
import { PBACGuard } from "src/auth/pbac.guard";
import { Permissions, Session } from "src/shared/decorators";
import { CheckWalletPermissions } from "src/shared/constants";
import { SessionObject } from "src/shared/interfaces";
import { CandidateUploadOriginGuard } from "./candidate-documents.controller";
import { BrowserApplicationService } from "./browser-application.service";
import { BrowserAnswerInput, BrowserApproveInput, BrowserControlInput, BrowserPrepareInput, BrowserStartInput, BrowserStepInput } from "./browser-application.dto";

@Controller("profile/browser-applications")
@UseGuards(PBACGuard)
@Permissions(CheckWalletPermissions.USER)
@UsePipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }))
export class BrowserApplicationController {
  constructor(private readonly browser: BrowserApplicationService) {}
  @Post("prepare") @UseGuards(CandidateUploadOriginGuard)
  prepare(@Session() s: SessionObject, @Body() input: BrowserPrepareInput) { return this.browser.prepare(s.address, input.documentId); }
  @Post("start") @UseGuards(CandidateUploadOriginGuard)
  start(@Session() s: SessionObject, @Body() input: BrowserStartInput) { return this.browser.start(s.address, input); }
  @Get(":id")
  @Header("Cache-Control", "private, no-store")
  status(@Session() s: SessionObject, @Param("id", ParseUUIDPipe) id: string) { return this.browser.status(s.address, id); }
  @Post(":id/step") @UseGuards(CandidateUploadOriginGuard)
  step(@Session() s: SessionObject, @Param("id", ParseUUIDPipe) id: string, @Body() input: BrowserStepInput) { return this.browser.step(s.address, id, input); }
  @Post(":id/approve") @UseGuards(CandidateUploadOriginGuard)
  approve(@Session() s: SessionObject, @Param("id", ParseUUIDPipe) id: string, @Body() input: BrowserApproveInput) { return this.browser.approve(s.address, id, input); }
  @Post(":id/answer") @UseGuards(CandidateUploadOriginGuard)
  answer(@Session() s: SessionObject, @Param("id", ParseUUIDPipe) id: string, @Body() input: BrowserAnswerInput) { return this.browser.answer(s.address, id, input); }
  @Post(":id/control") @UseGuards(CandidateUploadOriginGuard)
  control(@Session() s: SessionObject, @Param("id", ParseUUIDPipe) id: string, @Body() input: BrowserControlInput) { return this.browser.control(s.address, id, input); }
  @Get(":id/artifacts/:exportId")
  async artifact(@Session() s: SessionObject, @Param("id", ParseUUIDPipe) id: string, @Param("exportId", ParseUUIDPipe) exportId: string, @Res() response: Response) {
    const file = await this.browser.artifact(s.address, id, exportId);
    response.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${file.filename.replace(/["\\\r\n]/g, "_")}"`,
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" }).send(file.bytes);
  }
}
