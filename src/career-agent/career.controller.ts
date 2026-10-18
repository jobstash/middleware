import { RecommendationEmbeddingService } from "src/auth/profile/recommendation-embedding.service";
import { CvMatchService } from "./cv-match.service";
import { ConfigService } from "@nestjs/config";
import { verifyDocumentRegistration } from "./document-registration";
import { DirectionsInput } from "./application.dto";
import { NetworkService } from "./network.service";
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import { PBACGuard } from "src/auth/pbac.guard";
import { ProfileService } from "src/auth/profile/profile.service";
import { Permissions, Session } from "src/shared/decorators";
import { CheckWalletPermissions } from "src/shared/constants";
import { SessionObject } from "src/shared/interfaces";
import { CareerRepository } from "./career.repository";
import {
  LinkResumeInput,
  PasteCvInput,
  CvMatchPageInput,
  ActionInput,
  DocumentInput,
  MutationInput,
  PageInput,
  StackInput,
} from "./career.dto";

@Controller("profile")
@UseGuards(PBACGuard)
@Permissions(CheckWalletPermissions.USER)
@UsePipes(
  new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
  }),
)
export class CareerController {
  constructor(
    private readonly career: CareerRepository,
    private readonly profile: ProfileService,
    private readonly network: NetworkService,
    private readonly config: ConfigService,
    private readonly cvMatches: CvMatchService,
    private readonly embeddings: RecommendationEmbeddingService,
  ) {}
  @Get("career/cv-matches") matchDocuments(
    @Session() { address }: SessionObject,
  ) {
    return this.cvMatches.documents(address);
  }
  @Get("career/cv-matches/:id/reviews") cvReviews(
    @Session() { address }: SessionObject,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.career.cvReviews(address, id);
  }
  @Get("career/cv-matches/:id") cvResults(
    @Session() { address }: SessionObject,
    @Param("id", ParseUUIDPipe) id: string,
    @Query() page: CvMatchPageInput,
  ) {
    return this.cvMatches.matches(address, id, page.page, page.limit, page.job);
  }
  @Get("career") getCareer(
    @Session() { address }: SessionObject,
  ): ReturnType<CareerRepository["career"]> {
    return this.career.career(address);
  }
  @Get("career/context") context(
    @Session() { address }: SessionObject,
  ): ReturnType<ProfileService["getCareerContext"]> {
    return this.profile.getCareerContext(address);
  }
  @Post("career/documents/resume") linkResume(
    @Session() { address }: SessionObject,
    @Body() input: LinkResumeInput,
  ) {
    return this.career.linkResume(address, input);
  }
  @Post("career/documents/text") async pasteCv(
    @Session() { address }: SessionObject,
    @Body() input: PasteCvInput,
  ) {
    const document = await this.career.pasteCv(
      address,
      input.text,
      input.filename,
    );
    void this.embeddings.refresh(true);
    return document;
  }
  @Get("career/documents/:id/text") textDocument(
    @Session() { address }: SessionObject,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.career.textDocument(address, id);
  }
  @Post("career/documents") async document(
    @Session() { address }: SessionObject,
    @Body() input: DocumentInput,
    @Headers("authorization") authorization: string,
    @Headers("x-document-time") stamp: string,
    @Headers("x-document-signature") signature: string,
  ): ReturnType<CareerRepository["registerDocument"]> {
    verifyDocumentRegistration(
      this.config.get<string>("CAREER_DOCUMENT_SECRET"),
      authorization,
      stamp,
      signature,
      input,
    );
    const document = await this.career.registerDocument(address, input);
    void this.embeddings.refresh(true);
    return document;
  }
  @Get("career/directions") directions(
    @Session() s: SessionObject,
  ): ReturnType<CareerRepository["directions"]> {
    return this.career.directions(s.address);
  }
  @Post("career/directions") saveDirections(
    @Session() s: SessionObject,
    @Body() input: DirectionsInput,
  ): ReturnType<CareerRepository["saveDirections"]> {
    return this.career.saveDirections(s.address, input);
  }
  @Get("stacks") stacks(
    @Session() { address }: SessionObject,
  ): ReturnType<CareerRepository["stacks"]> {
    return this.career.stacks(address);
  }
  @Post("stacks") createStack(
    @Session() { address }: SessionObject,
    @Body() input: StackInput,
  ): ReturnType<CareerRepository["saveStack"]> {
    return this.career.saveStack(address, input);
  }
  @Patch("stacks/:id") editStack(
    @Session() { address }: SessionObject,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: StackInput,
  ): ReturnType<CareerRepository["saveStack"]> {
    return this.career.saveStack(address, input, id);
  }
  @Delete("stacks/:id") removeStack(
    @Session() { address }: SessionObject,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() input: MutationInput,
  ): ReturnType<CareerRepository["deleteStack"]> {
    return this.career.deleteStack(address, id, input);
  }
  @Get("stacks/:id/results") async results(
    @Session() { address }: SessionObject,
    @Param("id") id: string,
    @Query() page: PageInput,
  ): Promise<
    Omit<Awaited<ReturnType<ProfileService["getRecommendedJobs"]>>, "jobs"> & {
      jobs: { job: import("src/shared/interfaces").JobListResult }[];
    }
  > {
    const { stacks, advanced } = await this.career.stacks(
      address,
      ["direction", "adjacent"].includes(id),
    );
    const stack = stacks.find(stack => stack.id === id);
    if (!stack) throw new NotFoundException("Stack not found");
    if (!advanced && id !== "best")
      await this.career.requireAdvanced(await this.career.owner(address));
    const effectiveStack =
      stack.intent === "network"
        ? {
            ...stack,
            allowedJobs: [...(await this.network.reachableJobs(address))],
          }
        : stack;
    const result = await this.profile.getRecommendedJobs(
      address,
      page.limit,
      "web",
      page.page,
      undefined,
      effectiveStack,
    );
    return { ...result, jobs: result.jobs.map(({ job }) => ({ job })) };
  }
  @Get("applications") applications(
    @Session() { address }: SessionObject,
  ): ReturnType<CareerRepository["applications"]> {
    return this.career.applications(address);
  }
  @Post("applications/actions") action(
    @Session() { address }: SessionObject,
    @Body() input: ActionInput,
  ): ReturnType<CareerRepository["action"]> {
    return this.career.action(address, input);
  }
}
