import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";

export class UserSkill {
  public static readonly UserSkillType = t.strict({
    id: t.string,
    name: t.union([t.string, t.null]),
    canTeach: t.union([t.boolean, t.null]),
  });

  id: string;
  name: string | null;
  canTeach: boolean | null;

  constructor(raw: UserSkill) {
    const { id, name, canTeach } = raw;

    const result = UserSkill.UserSkillType.decode(raw);

    this.id = id;
    this.name = name;
    this.canTeach = canTeach;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `user skill instance with username ${this.id} failed validation with error '${x}'`,
        );
      });
    }
  }
}
