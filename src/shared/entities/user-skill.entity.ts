import { notStringOrNull } from "../helpers";
import { UserSkill } from "../interfaces";

export class UserSkillEntity {
  constructor(private readonly raw: UserSkill) {}

  getProperties(): UserSkill {
    return new UserSkill({
      id: notStringOrNull(this.raw?.id),
      name: notStringOrNull(this.raw?.name),
      normalizedName: notStringOrNull(this.raw?.normalizedName),
      canTeach: this.raw?.canTeach ?? null,
    });
  }
}
