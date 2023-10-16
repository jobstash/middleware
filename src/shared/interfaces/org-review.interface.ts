import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";
import { OrgInfo } from "./org-info.interface";
import { OrgSalaryReview } from "./org-salary-review.interface";
import { OrgRating } from "./org-ratings.interface";
import { OrgStaffReview } from "./org-staff-review.interface";

export class OrgReview {
  public static readonly OrgReviewType = t.strict({
    org: OrgInfo.OrgInfoType,
    membershipStatus: t.union([t.string, t.null]),
    startDate: t.union([t.number, t.null]),
    endDate: t.union([t.number, t.null]),
    reviewedTimestamp: t.number,
    commitCount: t.union([t.number, t.null]),
    salary: OrgSalaryReview.OrgSalaryReviewType,
    rating: OrgRating.OrgRatingType,
    review: OrgStaffReview.OrgStaffReviewType,
  });

  org: OrgInfo;
  membershipStatus: string | null;
  startDate: number | null;
  endDate: number | null;
  commitCount: number | null;
  salary: OrgSalaryReview;
  rating: OrgRating;
  review: OrgStaffReview;
  reviewedTimestamp: number;

  constructor(raw: OrgReview) {
    const {
      org,
      membershipStatus,
      startDate,
      endDate,
      commitCount,
      salary,
      rating,
      review,
      reviewedTimestamp,
    } = raw;

    const result = OrgReview.OrgReviewType.decode(raw);

    this.org = org;
    this.membershipStatus = membershipStatus;
    this.startDate = startDate;
    this.endDate = endDate;
    this.commitCount = commitCount;
    this.salary = salary;
    this.rating = rating;
    this.review = review;
    this.reviewedTimestamp = reviewedTimestamp;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `org review instance with id ${this.org.orgId} failed validation with error '${x}'`,
        );
      });
    }
  }
}
