import { Field, ObjectType, Int } from '@nestjs/graphql';

@ObjectType()
export class UploadObject {
  @Field(() => String)
  base64: string;

  @Field(() => String)
  extensionName?: string;

  @Field(() => String)
  encoding: BufferEncoding;

  @Field(() => String)
  originalName?: string;
}

@ObjectType()
export class FileObject extends UploadObject {
  @Field(() => Int)
  fileId?: number;

  @Field(() => String)
  path?: string;
}

export interface Files {
  id: number;
  created?: string | null;
  path?: string | null;
  original_name: string | null;
}
