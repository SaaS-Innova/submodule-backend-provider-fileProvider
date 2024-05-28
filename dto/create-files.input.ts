import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class CreateFilesInput {
  @Field(() => String, { nullable: true })
  path?: string | null;

  @Field(() => String, { nullable: true })
  original_name?: string | null;
}
