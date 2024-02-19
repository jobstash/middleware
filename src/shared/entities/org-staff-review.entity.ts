import { notStringOrNull } from "../helpers";
import { OrgStaffReview } from "../interfaces";

export class OrgStaffReviewEntity {
  constructor(private readonly raw: OrgStaffReview) {}

  getProperties(): OrgStaffReview {
    return new OrgStaffReview({
      id: notStringOrNull(this.raw?.id),
      title: notStringOrNull(this.raw?.title),
      location: notStringOrNull(this.raw?.location),
      timezone: notStringOrNull(this.raw?.timezone),
      pros: notStringOrNull(this.raw?.pros),
      cons: notStringOrNull(this.raw?.cons),
    });
  }
}
