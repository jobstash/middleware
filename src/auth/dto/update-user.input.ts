import { InputType, OmitType } from '@nestjs/graphql';
import { CreateUserInput } from './create-user.input';

@InputType()
export class UpdateUserInput extends OmitType(CreateUserInput, [
    'email',
    'password',
] as const) { }