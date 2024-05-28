import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class FileObject {
  @Field(() => Int)
  fileId?: number;

  @Field(() => String)
  base64: string;

  @Field(() => String)
  extensionName?: string;

  @Field(() => String)
  encoding: any;

  @Field(() => String)
  originalName?: string;
}
