import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Field, Int, ObjectType } from '@nestjs/graphql';
import { ResponseObject } from '../../../commons';
import { MailAttachments } from '../../../modules/mail-attachments/entities/mail-attachments.entity';
import { Company } from '../../../modules/company/entities/company.entity';

@Index('files_pkey', ['id'], { unique: true })
@Entity('files', { schema: 'public' })
@ObjectType()
export class Files extends ResponseObject {
  @Field(() => Int, {})
  @PrimaryGeneratedColumn({ type: 'integer', name: 'id' })
  id: number;

  @Field(() => String, { nullable: true })
  @Column('bigint', { name: 'created', nullable: true })
  created: string | null;

  @Field(() => String, { nullable: true })
  @Column('text', { name: 'path', nullable: true })
  path: string | null;

  @Field(() => String, { nullable: true })
  @Column('character varying', {
    name: 'original_name',
    nullable: true,
    length: 256,
  })
  original_name: string | null;

  @Field(() => [MailAttachments])
  @OneToMany(
    () => MailAttachments,
    (mail_attachments) => mail_attachments.files,
  )
  mail_attachments: MailAttachments[];

  @Field(() => [Company])
  @OneToMany(() => Company, (company) => company.logo_file)
  companies: Company[];
}
