import { ValidateBy, ValidationOptions } from "class-validator";

export function IsQuarterHourOffset(
  validationOptions?: ValidationOptions,
): PropertyDecorator {
  return ValidateBy(
    {
      name: "isQuarterHourOffset",
      validator: {
        // IsDivisibleBy truncates fractional divisors to integers. Scaling
        // hours to quarter-hours avoids that and is exact for multiples of .25.
        validate: (value: unknown): boolean =>
          typeof value === "number" && Number.isInteger(value * 4),
        defaultMessage: () =>
          "UTC offset must use quarter-hour increments, such as 3, 5.5, or 5.75",
      },
    },
    validationOptions,
  );
}
