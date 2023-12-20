import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import { report } from "io-ts-human-reporter";
import { OrgRating } from "./org-ratings.interface";
import { OrgSalaryReview } from "./org-salary-review.interface";
import { OrgStaffReview } from "./org-staff-review.interface";

export class OrgReview {
  public static readonly OrgReviewType = t.strict({
    membershipStatus: t.union([t.string, t.null]),
    startDate: t.union([t.number, t.null]),
    endDate: t.union([t.number, t.null]),
    reviewedTimestamp: t.union([t.number, t.null]),
    commitCount: t.union([t.number, t.null]),
    compensation: OrgSalaryReview.OrgSalaryReviewType,
    rating: OrgRating.OrgRatingType,
    review: OrgStaffReview.OrgStaffReviewType,
  });

  membershipStatus: string | null;
  startDate: number | null;
  endDate: number | null;
  commitCount: number | null;
  compensation: OrgSalaryReview;
  rating: OrgRating;
  review: OrgStaffReview;
  reviewedTimestamp: number;

  constructor(raw: OrgReview) {
    const {
      membershipStatus,
      startDate,
      endDate,
      commitCount,
      compensation,
      rating,
      review,
      reviewedTimestamp,
    } = raw;

    const result = OrgReview.OrgReviewType.decode(raw);

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
          `org review instance failed validation with error '${x}'`,
        );
      });
    }
  }
}

export class LeanOrgReview {
  public static readonly LeanOrgReviewType = t.strict({
    membershipStatus: t.union([t.string, t.null]),
    startDate: t.union([t.number, t.null]),
    endDate: t.union([t.number, t.null]),
    reviewedTimestamp: t.union([t.number, t.null]),
    commitCount: t.union([t.number, t.null]),
    rating: OrgRating.OrgRatingType,

    review: OrgStaffReview.OrgStaffReviewType,
  });

  membershipStatus: string | null;
  startDate: number | null;
  endDate: number | null;
  commitCount: number | null;
  review: OrgStaffReview;
  rating: OrgRating;
  reviewedTimestamp: number;

  constructor(raw: LeanOrgReview) {
    const {
      membershipStatus,
      startDate,
      endDate,
      commitCount,
      review,
      rating,
      reviewedTimestamp,
    } = raw;

    const result = LeanOrgReview.LeanOrgReviewType.decode(raw);

    this.membershipStatus = membershipStatus;
    this.startDate = startDate;
    this.endDate = endDate;
    this.commitCount = commitCount;
    this.review = review;
    this.rating = rating;
    this.reviewedTimestamp = reviewedTimestamp;

    if (isLeft(result)) {
      report(result).forEach(x => {
        throw new Error(
          `lean org review instance failed validation with error '${x}'`,
        );
      });
    }
  }
}
