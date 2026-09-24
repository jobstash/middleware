import { ValidationPipe } from "@nestjs/common";
import { UpdateJobPreferencesInput } from "./update-job-preferences.input";

describe("Job preference UTC offset validation", () => {
  const pipe = new ValidationPipe({ enableDebugMessages: false });
  const validate = (utcOffset: unknown): Promise<UpdateJobPreferencesInput> =>
    pipe.transform(
      { workModes: ["remote"], utcOffset },
      { type: "body", metatype: UpdateJobPreferencesInput },
    );

  it.each(Array.from({ length: 105 }, (_, index) => -12 + index / 4))(
    "accepts UTC offset %s",
    async utcOffset => {
      await expect(validate(utcOffset)).resolves.toMatchObject({ utcOffset });
    },
  );

  it.each(["3", "5.5", "5.75", "-3.5"])(
    "accepts existing numeric string inputs for %s",
    async utcOffset => {
      await expect(validate(utcOffset)).resolves.toMatchObject({
        utcOffset: Number(utcOffset),
      });
    },
  );

  it.each([null, undefined])("allows an unset offset (%s)", async utcOffset => {
    await expect(validate(utcOffset)).resolves.toMatchObject({ utcOffset });
  });

  it.each([-12.25, 14.25, 3.1, 5.6, -3.3, 3.001, "invalid", NaN, Infinity])(
    "rejects invalid UTC offset %s",
    async utcOffset => {
      await expect(validate(utcOffset)).rejects.toThrow();
    },
  );

  it("explains the allowed increments for an invalid offset", async () => {
    await expect(validate(3.1)).rejects.toMatchObject({
      response: {
        message: [
          "UTC offset must use quarter-hour increments, such as 3, 5.5, or 5.75",
        ],
      },
    });
  });
});
