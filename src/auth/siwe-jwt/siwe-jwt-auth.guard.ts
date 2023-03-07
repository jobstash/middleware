import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class SiweJwtAuthGuard extends AuthGuard("siwe-jwt") {}
