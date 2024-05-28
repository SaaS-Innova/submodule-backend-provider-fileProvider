import { dataSource } from '../../../../core/data-source';
import { Files } from '../entities/files.entity';

export const filesRepository = dataSource.getRepository(Files);
