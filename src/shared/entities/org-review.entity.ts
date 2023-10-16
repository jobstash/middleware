import { OrgReview } from "../interfaces";

export class OrgReviewEntity {
  constructor(private readonly raw: OrgReview) {}

  getProperties(): OrgReview {
    return new OrgReview({ ...this.raw });
  }
}
