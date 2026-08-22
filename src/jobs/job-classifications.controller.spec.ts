import { validate } from "class-validator";
import {
  CANONICAL_JOB_CLASSIFICATIONS,
  CANONICAL_JOB_CLASSIFICATION_CODES,
} from "src/shared/constants";
import { ChangeJobClassificationInput } from "./dto/change-classification.input";
import { JobClassificationsController } from "./job-classifications.controller";

describe("canonical Jobpost classifications", () => {
  it("publishes exactly 36 unique values including canonical FDE metadata", () => {
    const response = new JobClassificationsController().list();
    const values = response.data;

    expect(response.success).toBe(true);
    expect(values).toHaveLength(36);
    expect(new Set(values.map(value => value.code)).size).toBe(36);
    expect(new Set(values.map(value => value.filterKey)).size).toBe(36);
    expect(values).toEqual(CANONICAL_JOB_CLASSIFICATIONS);
    expect(values).toContainEqual({
      code: "FORWARD_DEPLOYED_ENGINEER",
      label: "Forward Deployed Engineer",
      filterKey: "forward-deployed-engineer",
      pillarSlug: "cl-forward-deployed-engineer",
    });
  });

  it("rejects an unknown manual classification before mutation", async () => {
    const input = Object.assign(new ChangeJobClassificationInput(), {
      shortUUIDs: ["job-one"],
      classification: "FDE",
    });
    const canonical = Object.assign(new ChangeJobClassificationInput(), {
      shortUUIDs: ["job-one"],
      classification: "FORWARD_DEPLOYED_ENGINEER",
    });

    expect(CANONICAL_JOB_CLASSIFICATION_CODES).toHaveLength(36);
    await expect(validate(input)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: "classification" }),
      ]),
    );
    await expect(validate(canonical)).resolves.toEqual([]);
  });
});
