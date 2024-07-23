import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class RawProjectWebsiteMetadata {
  @ApiProperty()
  copyrightName: string;
  @ApiProperty()
  copyrightStart: string;
  @ApiProperty()
  createdTimestamp: number;
  @ApiProperty()
  id: string;
  @ApiProperty()
  isCrypto: boolean;
  @ApiProperty()
  isEmpty: boolean;
  @ApiProperty()
  isError: boolean;
  @ApiProperty()
  isParkedWebsite: boolean;
  @ApiProperty()
  secondpassCopyrightEnd: string;
  @ApiProperty()
  secondpassCopyrightName: string;
  @ApiProperty()
  secondpassCopyrightStart: string;
  @ApiProperty()
  secondpassIsActive: boolean;
  @ApiProperty()
  secondpassIsCrypto: boolean;
  @ApiProperty()
  secondpassIsRenamed: boolean;
  @ApiProperty()
  updatedTimestamp: number;
  @ApiProperty()
  url: string;
}

export class RawProjectWebsite {
  @ApiProperty()
  id: string;
  @ApiProperty()
  name: string;
  @ApiProperty()
  category: string;
  @ApiProperty()
  content: string;
  @ApiProperty()
  defiLlamaId: string;
  @ApiProperty()
  createdTimestamp: number;
  @ApiProperty()
  url: string;
  @ApiPropertyOptional()
  metadata: RawProjectWebsiteMetadata | null;
}
