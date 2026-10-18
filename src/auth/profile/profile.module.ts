import {
  McpDataController,
  McpUsageController,
} from "src/mcp/mcp-data.controller";
import { McpDataService } from "src/mcp/mcp-data.service";
import { McpMeteringService } from "src/mcp/mcp-metering.service";
import { McpOAuthService } from "src/mcp/mcp-oauth.service";
import {
  McpDiscoveryController,
  McpOAuthController,
  McpConnectionsController,
} from "src/mcp/mcp-oauth.controller";
import { DeviceExecutionController, ProfileDevicesController } from "src/career-agent/device-execution.controller";
import { DeviceAuthGuard } from "src/career-agent/device-execution.guard";
import { ConnectionInputGuard } from "src/career-agent/connection-input.guard";
import { ScreeningService } from "src/career-agent/screening.service";
import { ScreeningController } from "src/career-agent/screening.controller";
import { CvMatchService } from "src/career-agent/cv-match.service";
import { NetworkService } from "src/career-agent/network.service";
import { NetworkController } from "src/career-agent/network.controller";
import { AgentService } from "src/career-agent/agent.service";
import { AgentController } from "src/career-agent/agent.controller";
import { VoiceConnectionController } from "src/career-agent/voice-connection.controller";
import { VoiceConnectionService } from "src/career-agent/voice-connection.service";
import { VoiceController, VoiceInputGuard, DeviceVoiceController } from "src/career-agent/voice.controller";
import { VoiceService } from "src/career-agent/voice.service";
import { CandidateCapabilitiesController } from "src/career-agent/candidate-capabilities.controller";
import { CandidateCapabilityService } from "src/career-agent/candidate-capabilities.service";
import { CandidateSetupService } from "src/career-agent/candidate-setup.service";
import { CandidateSetupController } from "src/career-agent/candidate-setup.controller";
import { CandidateMatchingService } from "src/career-agent/candidate-matching.service";
import { CandidateDocumentsService } from "src/career-agent/candidate-documents.service";
import { CandidateDocumentCodec } from "src/career-agent/candidate-document-codec";
import { CandidateIntroductionService } from "src/career-agent/candidate-introductions.service";
import { ScreeningGovernanceService } from "src/career-agent/screening-governance.service";
import { ScreeningGovernanceController } from "src/career-agent/screening-governance.controller";
import {
  CandidateDocumentsController, CandidateDocumentOAuthController,
  CandidateUploadOriginGuard, CandidateDocumentOAuthGuard,
} from "src/career-agent/candidate-documents.controller";
import { CareerToolService } from "src/career-agent/career-tools.service";
import { CANDIDATE_STRIPE_CLIENT, SubscriptionService } from "src/career-agent/subscription.service";
import Stripe from "stripe";
import {
  CandidateSubscriptionController,
  CandidateStripeWebhookController,
} from "src/career-agent/subscription.controller";
import { forwardRef, Module } from "@nestjs/common";
import { ProfileService } from "./profile.service";
import { ProfileController } from "./profile.controller";
import { JwtService } from "@nestjs/jwt";
import { OrganizationsService } from "src/organizations/organizations.service";
import { MailModule } from "src/mail/mail.module";
import { MailService } from "src/mail/mail.service";
import { RpcService } from "../../user/rpc.service";
import { ScorerService } from "src/scorer/scorer.service";
import { JobsService } from "src/jobs/jobs.service";
import { HttpModule } from "@nestjs/axios";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { REALLY_LONG_TIME } from "src/shared/constants";
import * as https from "https";
import { AuthModule } from "../auth.module";
import { PrivyModule } from "../privy/privy.module";
import { GithubModule } from "../github/github.module";
import { UserModule } from "src/user/user.module";
import { Auth0Module } from "src/auth0/auth0.module";
import { TagsService } from "src/tags/tags.service";
import { StripeModule } from "src/stripe/stripe.module";
import { PublicProfilesController } from "./public-profiles.controller";
import { ProfileModerationController } from "./profile-moderation.controller";
import { EmailDigestService } from "./email-digest.service";
import { RecommendationEmbeddingService } from "./recommendation-embedding.service";
import { ApplicationService } from "src/career-agent/application.service";
import { ApplicationController } from "src/career-agent/application.controller";
import { CareerController } from "src/career-agent/career.controller";
import { BrowserApplicationController } from "src/career-agent/browser-application.controller";
import { BrowserApplicationService } from "src/career-agent/browser-application.service";
import { DeviceExecutionService } from "src/career-agent/device-execution.service";

@Module({
  imports: [
    Auth0Module,
    forwardRef(() => AuthModule),
    forwardRef(() => UserModule),
    forwardRef(() => PrivyModule),
    forwardRef(() => GithubModule),
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        headers: {
          Authorization: `Bearer ${configService.get<string>(
            "SCORER_API_KEY",
          )}`,
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        timeout: REALLY_LONG_TIME,
        baseURL: configService.get<string>("SCORER_DOMAIN"),
      }),
    }),
    MailModule,
    ConfigModule,
    ThrottlerModule.forRoot(),
    StripeModule,
  ],
  controllers: [
    McpDiscoveryController,
    McpOAuthController,
    McpConnectionsController,
    McpDataController,
    McpUsageController,
    ProfileController,
    PublicProfilesController,
    ProfileModerationController,
    CareerController,
    ApplicationController,
    BrowserApplicationController,
    NetworkController,
    AgentController,
    VoiceConnectionController,
    VoiceController,
    DeviceVoiceController,
    CandidateCapabilitiesController,
    ScreeningGovernanceController,
    CandidateDocumentsController,
    CandidateSetupController,
    CandidateDocumentOAuthController,
    DeviceExecutionController,
    ProfileDevicesController,
    ScreeningController,
    CandidateSubscriptionController,
    CandidateStripeWebhookController,
  ],
  providers: [
    McpOAuthService,
    McpDataService,
    McpMeteringService,
    ProfileService,
    ApplicationService,
    BrowserApplicationService,
    CvMatchService,
    ScreeningService,
    ScreeningGovernanceService,
    NetworkService,
    AgentService,
    DeviceExecutionService,
    DeviceAuthGuard,
    ConnectionInputGuard,
    VoiceConnectionService,
    VoiceService,
    VoiceInputGuard,
    CandidateCapabilityService,
    CandidateSetupService,
    CandidateMatchingService,
    CandidateDocumentsService,
    CandidateDocumentCodec,
    CandidateIntroductionService,
    CandidateUploadOriginGuard,
    CandidateDocumentOAuthGuard,
    CareerToolService,
    SubscriptionService,
    {
      provide: CANDIDATE_STRIPE_CLIENT,
      useFactory: (config: ConfigService): Stripe | null => {
        const key = config.get<string>("CANDIDATE_STRIPE_SECRET_KEY");
        return key ? new Stripe(key) : null;
      },
      inject: [ConfigService],
    },
    JwtService,
    MailService,
    OrganizationsService,
    RpcService,
    ScorerService,
    JobsService,
    TagsService,
    EmailDigestService,
    RecommendationEmbeddingService,
  ],
  exports: [ProfileService],
})
export class ProfileModule {}
