import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from "class-validator";

export class CreateRepositoryDto {
  @IsNotEmpty()
  @IsNumber()
  id: number;

  @IsOptional()
  @IsString()
  nodeId?: string;

  @IsNotEmpty()
  @IsString()
  name: string;

  @IsNotEmpty()
  @IsString()
  fullName: string;

  @IsNotEmpty()
  @IsString()
  htmlUrl: string;

  @IsNotEmpty()
  @IsBoolean()
  fork: boolean;

  @IsNotEmpty()
  @IsString()
  url: string;

  @IsNotEmpty()
  @IsString()
  createdAt: string;

  @IsNotEmpty()
  @IsString()
  updatedAt: string;

  @IsNotEmpty()
  @IsString()
  pushedAt: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  weeklyHistogram?: string;

  @IsOptional()
  @IsString()
  dailyHistogram?: string;

  @IsOptional()
  @IsNumber()
  totalCommits?: number;

  @IsOptional()
  @IsNumber()
  lastSync?: number;
}
