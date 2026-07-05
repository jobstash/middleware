import { nonZeroOrNull, notStringOrNull } from "../helpers";
import { DelegateAccessRequest } from "../interfaces/org/delegate-access-request.interface";

export class DelegateAccessRequestEntity {
  constructor(private readonly raw: DelegateAccessRequest) {}

  getProperties(): DelegateAccessRequest {
    return new DelegateAccessRequest({
      id: this.raw.id,
      fromOrgId: this.raw.fromOrgId,
      fromOrgName: this.raw.fromOrgName,
      fromOrgLogo: notStringOrNull(this.raw.fromOrgLogo),
      toOrgId: this.raw.toOrgId,
      toOrgName: this.raw.toOrgName,
      toOrgLogo: notStringOrNull(this.raw.toOrgLogo),
      status: this.raw.status,
      requestor: this.raw.requestor,
      createdTimestamp: nonZeroOrNull(this.raw.createdTimestamp),
      expiryTimestamp: nonZeroOrNull(this.raw.expiryTimestamp),
      updatedTimestamp: nonZeroOrNull(this.raw.updatedTimestamp),
      grantor: notStringOrNull(this.raw.grantor),
      revoker: notStringOrNull(this.raw.revoker),
      authToken: notStringOrNull(this.raw.authToken),
      link: notStringOrNull(this.raw.link),
    });
  }
}
