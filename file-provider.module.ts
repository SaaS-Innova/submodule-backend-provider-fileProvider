import { Module } from '@nestjs/common';
import { ResponseMsgService } from 'src/commons';
import { FilesServiceProvider } from './file-provider.service';
import { BucketProviderModule } from '../../submodule/provider/bucketProvider/bucket-provider.module';

@Module({
  imports: [BucketProviderModule],
  providers: [FilesServiceProvider, ResponseMsgService],
  exports: [FilesServiceProvider],
})
export class FileProviderModule {}
