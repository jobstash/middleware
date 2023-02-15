import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from "class-validator";

@ValidatorConstraint({ name: "Compare" })
export class CompareConstraint implements ValidatorConstraintInterface {
  // eslint-disable-next-line
  validate(value: any, args: ValidationArguments): boolean {
    const [targetProperty, operator, comparatorFunction] = args.constraints;
    const targetPropertyValue = args.object[targetProperty];

    if (operator !== null) {
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
    } else {
      if (comparatorFunction !== null) {
        return comparatorFunction(value, targetPropertyValue);
      } else {
        return false;
      }
    }
  }

  defaultMessage(args: ValidationArguments): string {
    const [targetProperty, operator] = args.constraints;
    return `${args.property} is not ${operator} ${targetProperty}`;
  }
}

export function Compare(
  targetProperty: string,
  operator?: "==" | "===" | ">" | "<" | "!=" | "!==" | ">=" | "<=",
  // eslint-disable-next-line
  comparatorFunction?: (value: any, targetPropertyValue: any) => boolean,
  validationOptions?: ValidationOptions,
) {
  // eslint-disable-next-line
  return function (object: any, propertyName: string): void {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [targetProperty, operator, comparatorFunction],
      validator: CompareConstraint,
    });
  };
}
