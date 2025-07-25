import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";
import { UserAvailableForWork } from "./user/user-available-for-work.interface";

export class TalentList {
  public static readonly TalentListType = t.strict({
    id: t.string,
    name: t.string,
    description: t.string,
    normalizedName: t.string,
    createdTimestamp: t.number,
    updatedTimestamp: t.union([t.number, t.null]),
  });

  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  normalizedName: string;

  @ApiProperty()
  createdTimestamp: number;

  @ApiPropertyOptional()
  updatedTimestamp?: number;

  constructor(raw: TalentList) {
    const {
      id,
      name,
      description,
      normalizedName,
      createdTimestamp,
      updatedTimestamp,
    } = raw;

    this.id = id;
    this.name = name;
    this.description = description;
    this.normalizedName = normalizedName;
    this.createdTimestamp = createdTimestamp;
    this.updatedTimestamp = updatedTimestamp;

    const result = TalentList.TalentListType.decode(raw);

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `talent list instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}

export class TalentListWithUsers extends TalentList {
  public static readonly TalentListWithUsersType = t.intersection([
    TalentList.TalentListType,
    t.strict({
      users: t.array(UserAvailableForWork.UserAvailableForWorkType),
    }),
  ]);

  @ApiProperty()
  users: UserAvailableForWork[];

  constructor(raw: TalentListWithUsers) {
    super(raw);
    this.users = raw.users;

    const result = TalentListWithUsers.TalentListWithUsersType.decode(raw);

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `talent list with users instance with id ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
