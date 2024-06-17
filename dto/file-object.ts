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
  encoding: BufferEncoding;

  @Field(() => String)
  originalName?: string;

  @Field(() => String)
  path?: string;
}

export interface Files {
  id: number;
  created: string | null;
  path: string | null;
  original_name: string | null;
}