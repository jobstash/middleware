import { IsArray, IsNotEmpty, IsString } from "class-validator";

export class LinkReposToProjectInput {
  @IsNotEmpty()
  @IsString()
  projectId: string;

  @IsNotEmpty()
  @IsArray()
  repos: string[];
}
