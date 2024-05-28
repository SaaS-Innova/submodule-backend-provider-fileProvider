import { Files } from '../entities/files.entity';
import { dataSource } from '../../../core/data-source';

export const filesRepository = dataSource.getRepository(Files);
