import { Field, ObjectType } from "@nestjs/graphql";

@ObjectType()
export class Response {
    @Field({ description: 'Success status of the request' })
    success: boolean;

    @Field({ description: 'Information about the response' })
    message: string;
}