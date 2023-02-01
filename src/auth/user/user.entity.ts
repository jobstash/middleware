import { Field, ObjectType } from "@nestjs/graphql";
import { Node } from "neo4j-driver";
import { UserClaims } from "../../interfaces/user/user-claims.interface";
import { UserProperties } from "../../interfaces/user/user-properties.interface";
@ObjectType()
export class User {
  constructor(private readonly node: Node) {}

  @Field({ description: "UUID of the record" })
  id: string;

  @Field({ description: "Email address of the user", nullable: true })
  email: string;

  @Field({ description: "Password of the user", nullable: true })
  password: string;

  @Field({
    description: "Github Access Token of the user when signed in",
    nullable: true,
  })
  accessToken: string;

  getId(): string {
    // eslint-disable-next-line
    return (<Record<string, any>>this.node.properties).id;
  }

  getPassword(): string {
    // eslint-disable-next-line
    return (<Record<string, any>>this.node.properties).password;
  }

  getClaims(): UserClaims {
    // eslint-disable-next-line
    const { password, ...properties } = <Record<string, any>>(
      this.node.properties
    );

    return properties as UserClaims;
  }

  toJson(): UserProperties {
    // eslint-disable-next-line
    const { password, ...properties } = <Record<string, any>>(
      this.node.properties
    );

    return properties as UserProperties;
  }
}
