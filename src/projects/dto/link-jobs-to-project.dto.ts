import { IsArray, IsNotEmpty, IsString } from "class-validator";

export class LinkJobsToProjectInput {
  @IsNotEmpty()
  @IsString()
  projectId: string;

  @IsNotEmpty()
  @IsArray()
  jobs: string[];
}
