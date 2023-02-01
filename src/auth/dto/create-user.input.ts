import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class CreateUserInput {

    @Field({ description: 'First name of the user' })
    firstName: string;

    @Field({ description: 'Last name of the user' })
    lastName: string;

    @Field({ description: 'Email address of the user' })
    email: string;

    @Field({ description: 'Password of the user' })
    password: string;

}