import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { OrgUserProfile } from "../interfaces";

export class OrgUserProfileEntity {
  constructor(private readonly raw: OrgUserProfile) {}

  getProperties(): OrgUserProfile {
    return new OrgUserProfile({
      ...this.raw,
      linkedWallets: this.raw?.linkedWallets ?? [],
      avatar: notStringOrNull(this.raw?.avatar),
      email: this.raw?.email?.map(x => ({ ...x, main: x.main ?? false })) ?? [],
      calendly: notStringOrNull(this.raw?.calendly),
      username: notStringOrNull(this.raw?.username),
      linkedin: notStringOrNull(this.raw?.linkedin),
      orgId: notStringOrNull(this.raw?.orgId),
      contact: {
        value: notStringOrNull(this.raw?.contact?.value),
        preferred: notStringOrNull(this.raw?.contact?.preferred),
      },
      subscriberStatus: {
        status: this?.raw?.subscriberStatus?.status ?? false,
        expires: nonZeroOrNull(this.raw?.subscriberStatus?.expires),
      },
      internalReference: {
        referencePersonName: notStringOrNull(
          this.raw?.internalReference?.referencePersonName,
        ),
        referencePersonRole: notStringOrNull(
          this.raw?.internalReference?.referencePersonRole,
        ),
        referenceContact: notStringOrNull(
          this.raw?.internalReference?.referenceContact,
        ),
        referenceContactPlatform: notStringOrNull(
          this.raw?.internalReference?.referenceContactPlatform,
        ),
      },
    });
  }
}
