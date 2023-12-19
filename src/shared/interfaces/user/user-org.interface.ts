import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";
import { OrgInfo } from "../org-info.interface";
import { OrgSalaryReview } from "../org-salary-review.interface";
import { OrgRating } from "../org-ratings.interface";
import { OrgStaffReview } from "../org-staff-review.interface";

export class UserOrg {
  public static readonly UserOrgType = t.strict({
    org: OrgInfo.OrgInfoType,
    membershipStatus: t.union([t.string, t.null]),
    startDate: t.union([t.number, t.null]),
    endDate: t.union([t.number, t.null]),
    reviewedTimestamp: t.union([t.number, t.null]),
    commitCount: t.union([t.number, t.null]),
    compensation: OrgSalaryReview.OrgSalaryReviewType,
    rating: OrgRating.OrgRatingType,
    review: OrgStaffReview.OrgStaffReviewType,
  });

  org: OrgInfo;
  membershipStatus: string | null;
  startDate: number | null;
  endDate: number | null;
  commitCount: number | null;
  compensation: OrgSalaryReview;
  rating: OrgRating;
  review: OrgStaffReview;
  reviewedTimestamp: number;

  constructor(raw: UserOrg) {
    const {
      org,
      membershipStatus,
      startDate,
      endDate,
      commitCount,
      compensation,
      rating,
      review,
      reviewedTimestamp,
    } = raw;

    const result = UserOrg.UserOrgType.decode(raw);

    this.org = org;
    this.membershipStatus = membershipStatus;
    this.startDate = startDate;
    this.endDate = endDate;
    this.commitCount = commitCount;
    this.compensation = compensation;
    this.rating = rating;
    this.review = review;
    this.reviewedTimestamp = reviewedTimestamp;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `user org instance with id ${this.org.orgId} failed validation with error '${x}'`,
        );
      });
    }
  }
}
