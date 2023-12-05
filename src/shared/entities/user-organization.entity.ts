import { UserOrg } from "../interfaces";
import { nonZeroOrNull, notStringOrNull } from "../helpers";

export class UserOrgEntity {
  constructor(private readonly raw: UserOrg) {}

  getProperties(): UserOrg {
    const organization = this.raw;

    return new UserOrg({
      ...organization,
      docs: notStringOrNull(organization?.docs),
      logoUrl: notStringOrNull(organization?.logoUrl),
      headcountEstimate: nonZeroOrNull(organization?.headcountEstimate),
      github: notStringOrNull(organization?.github),
      twitter: notStringOrNull(organization?.twitter),
      discord: notStringOrNull(organization?.discord),
      telegram: notStringOrNull(organization?.telegram),
      website: notStringOrNull(organization?.website),
      alias: notStringOrNull(organization?.alias),
      createdTimestamp: nonZeroOrNull(organization?.createdTimestamp),
      updatedTimestamp: nonZeroOrNull(organization?.updatedTimestamp),
    });
  }
}
