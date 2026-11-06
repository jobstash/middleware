import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from "class-validator";

@ValidatorConstraint({ name: "Compare" })
export class CompareConstraint implements ValidatorConstraintInterface {
  validate<Value>(value: Value, args: ValidationArguments): boolean {
    const [targetProperty, operator, comparatorFunction] = args.constraints;
    const targetPropertyValue: Value = args.object[targetProperty];

    if (
      value === null ||
      targetPropertyValue === undefined ||
      targetPropertyValue === null
    ) {
      return true;
    } else if (operator !== null) {
      switch (operator) {
        case "==":
          return value == targetPropertyValue;
        case "===":
          return value === targetPropertyValue;
        case ">":
          return value > targetPropertyValue;
        case "<":
          return value < targetPropertyValue;
        case "!=":
          return value != targetPropertyValue;
        case "!==":
          return value !== targetPropertyValue;
        case ">=":
          return value >= targetPropertyValue;
        case "<=":
          return value <= targetPropertyValue;
        default:
          return false;
      }
    } else if (comparatorFunction !== null) {
      return comparatorFunction(value, targetPropertyValue);
    } else {
      return false;
    }
  }

  defaultMessage(args: ValidationArguments): string {
    const [targetProperty, operator] = args.constraints;
    return `${args.property} is not ${operator} ${targetProperty}`;
  }
}

export function Compare<Value, TargetValue>(
  targetProperty: string,
  operator?: "==" | "===" | ">" | "<" | "!=" | "!==" | ">=" | "<=",
  comparatorFunction?: (
    value: Value,
    targetPropertyValue: TargetValue,
  ) => boolean,
  validationOptions?: ValidationOptions,
): (object: object, propertyName: string) => void {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [targetProperty, operator, comparatorFunction],
      validator: CompareConstraint,
    });
  };
}
