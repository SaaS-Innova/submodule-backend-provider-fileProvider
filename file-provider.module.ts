import { Module } from '@nestjs/common';
import { ResponseMsgService } from 'src/commons';
import { BucketProviderModule } from '../bucketProvider/bucket-provider.module';
import { FileProvider } from './file-provider.service';

@Module({
  imports: [BucketProviderModule],
  providers: [FileProvider, ResponseMsgService],
  exports: [FileProvider],
})
export class FileProviderModule {}
