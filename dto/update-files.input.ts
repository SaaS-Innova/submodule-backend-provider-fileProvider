import { CreateFilesInput } from './create-files.input';
import { Field, InputType, Int, PartialType } from '@nestjs/graphql';

@InputType()
export class UpdateFilesInput extends PartialType(CreateFilesInput) {
  @Field(() => Int, { nullable: true })
  id: number;
}
