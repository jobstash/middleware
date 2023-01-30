import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class AuthUserInput {

    @Field({ description: "The email address to authenticate with"})
    email: string;

    @Field({ description: "The password to authenticate with" })
    password: string;


}