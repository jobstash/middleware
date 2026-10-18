import {
  BadRequestException, CanActivate, Controller, ExecutionContext, ForbiddenException, Get,
  Injectable, Param, ParseUUIDPipe, Post, Req, Res, UploadedFile, UseFilters, UseGuards, UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { PBACGuard } from "src/auth/pbac.guard";
import { Permissions, Session } from "src/shared/decorators";
import { CheckWalletPermissions } from "src/shared/constants";
import { SessionObject } from "src/shared/interfaces";
import { McpOAuthService } from "src/mcp/mcp-oauth.service";
import { CareerRepository } from "./career.repository";
import { McpBearerExceptionFilter } from "src/mcp/mcp-oauth.controller";
import { CandidateDocumentsService } from "./candidate-documents.service";
import { CandidateInvocationContext, CandidateScope } from "./candidate-context";
import { ApplicationService } from "./application.service";
import { candidateOrigin } from "./candidate-origin";

type CandidateRequest = Request & { candidateContext: CandidateInvocationContext };
const uploadOptions = { limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0, parts: 2 } };

@Injectable()
export class CandidateUploadOriginGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.headers.origin !== candidateOrigin(this.config)) throw new ForbiddenException("Invalid request origin");
    return true;
  }
}

@Injectable()
export class CandidateDocumentOAuthGuard implements CanActivate {
  constructor(private readonly oauth: McpOAuthService) {}
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CandidateRequest>();
    const identity = await this.oauth.identity(request.headers.authorization);
    const scopes = identity.scope.split(/\s+/) as CandidateScope[];
    const required = request.method === "GET" ? "career:read" : "career:write";
    if (!scopes.includes(required)) {
      context.switchToHttp().getResponse<Response>().setHeader("WWW-Authenticate", `Bearer error="insufficient_scope", scope="${required}"`);
      throw new ForbiddenException({ error: "insufficient_scope", scope: required });
    }
    request.candidateContext = { kind: "oauth", owner: identity.owner, wallet: identity.wallet, grantId: identity.grantId, clientId: identity.clientId, scopes };
    return true;
  }
}

function sendPrivateFile(response: Response, file: { bytes: Buffer; filename: string; contentType: string }): void {
  response.set({
    "Content-Type": file.contentType,
    "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox; default-src 'none'",
    "Referrer-Policy": "no-referrer",
  }).send(file.bytes);
}

@Controller("profile/candidate")
@UseGuards(PBACGuard)
@Permissions(CheckWalletPermissions.USER)
export class CandidateDocumentsController {
  constructor(private readonly career: CareerRepository, private readonly documents: CandidateDocumentsService, private readonly applications: ApplicationService) {}

  @Post("uploads/:id/content")
  @UseGuards(CandidateUploadOriginGuard)
  @UseInterceptors(FileInterceptor("file", uploadOptions))
  async upload(@Session() session: SessionObject, @Param("id", ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("Choose a PDF or DOCX");
    const context: CandidateInvocationContext = { kind: "session", owner: await this.career.owner(session.address), wallet: session.address };
    return this.documents.upload(context, id, file);
  }

  @Get("sources/:id/download")
  async source(@Session() session: SessionObject, @Param("id", ParseUUIDPipe) id: string, @Res() response: Response) {
    const context: CandidateInvocationContext = { kind: "session", owner: await this.career.owner(session.address), wallet: session.address };
    sendPrivateFile(response, await this.documents.download(context, id));
  }

  @Get("cvs/:id/download")
  async cv(@Session() session: SessionObject, @Param("id", ParseUUIDPipe) id: string, @Res() response: Response) {
    sendPrivateFile(response, { bytes: await this.applications.downloadCv(session.address, id), filename: "CV.pdf", contentType: "application/pdf" });
  }

  @Get("exports/:id/download")
  async exported(@Session() session: SessionObject, @Param("id", ParseUUIDPipe) id: string, @Res() response: Response) {
    const file = await this.applications.download(session.address, id);
    sendPrivateFile(response, { ...file, contentType: "application/pdf" });
  }
}

@Controller("mcp/candidate")
@UseGuards(CandidateDocumentOAuthGuard)
@UseFilters(McpBearerExceptionFilter)
export class CandidateDocumentOAuthController {
  constructor(private readonly career: CareerRepository, private readonly documents: CandidateDocumentsService, private readonly applications: ApplicationService) {}

  @Post("uploads/:id/content")
  @UseInterceptors(FileInterceptor("file", uploadOptions))
  async upload(@Req() request: CandidateRequest, @Param("id", ParseUUIDPipe) id: string, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("Choose a PDF or DOCX");
    return this.documents.upload(request.candidateContext, id, file);
  }

  @Get("sources/:id/download")
  async source(@Req() request: CandidateRequest, @Param("id", ParseUUIDPipe) id: string, @Res() response: Response) {
    sendPrivateFile(response, await this.documents.download(request.candidateContext, id));
  }

  @Get("cvs/:id/download")
  async cv(@Req() request: CandidateRequest, @Param("id", ParseUUIDPipe) id: string, @Res() response: Response) {
    const context = request.candidateContext;
    const file = await this.career.withCandidateInvocation(context, "cv_download", false, async () => ({
      bytes: await this.applications.downloadCv(context.wallet, id), filename: "CV.pdf", contentType: "application/pdf",
    }));
    sendPrivateFile(response, file);
  }

  @Get("exports/:id/download")
  async exported(@Req() request: CandidateRequest, @Param("id", ParseUUIDPipe) id: string, @Res() response: Response) {
    const context = request.candidateContext;
    const file = await this.career.withCandidateInvocation(context, "application_export_download", false, () => this.applications.download(context.wallet, id));
    sendPrivateFile(response, { ...file, contentType: "application/pdf" });
  }
}
