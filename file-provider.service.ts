import { Injectable } from '@nestjs/common';
import { AbstractService } from '../../commons/abstract.service';
import { Files } from './entities/files.entity';
import { ResponseMsgService } from '../../commons';
import { RemoveDto } from '../../commons/dto/remove.dto';
import * as fs from 'fs';
import * as path from 'path';
import { join, parse, resolve } from 'path';
import { config } from '../../commons/config';
import axios from 'axios';
import { CreateFilesInput } from './dto/create-files.input';
import { filesRepository } from './repository/files.repository';
import { UpdateFilesInput } from './dto/update-files.input';
import { FileObject } from './dto/file.dto';
import Jimp from 'jimp';
import { BucketProvider } from '../../submodule/provider/bucketProvider/bucket-provider.service';

@Injectable()
export class FilesServiceProvider extends AbstractService {
  constructor(
    protected responseMsgService: ResponseMsgService,
    protected bucketProvider: BucketProvider,
  ) {
    super(filesRepository, responseMsgService);
  }

  /**
   * Creates a new file record.
   * @param {CreateFilesInput} data - Data for creating a new file.
   * @param {string[]} [relations=null] - Relations to include in the query.
   * @returns {Promise<Files>} The created file entity.
   */
  async create(
    data: CreateFilesInput,
    relations: string[] = null,
  ): Promise<Files> {
    const create = this.abstractCreate(data, relations);
    return create;
  }

  /**
   * Updates an existing file record.
   * @param {number} id - The ID of the file to update.
   * @param {UpdateFilesInput} data - Data for updating the file.
   * @param {string[]} [relations=null] - Relations to include in the query.
   * @returns {Promise<Files | boolean>} The updated file entity or false if update failed.
   */
  async update(
    id: number,
    data: UpdateFilesInput,
    relations: string[] = null,
  ): Promise<Files | boolean> {
    const update = this.abstractUpdate(id, data, relations);
    return update;
  }

  /**
   * Removes a file record.
   * @param {number} id - The ID of the file to remove.
   * @returns {Promise<RemoveDto | boolean>} The remove result or false if removal failed.
   */
  async remove(id: number): Promise<RemoveDto | boolean> {
    const remove = this.abstractRemove(id);
    return remove;
  }

  /**
   * Saves a file to storage (local or S3).
   * @param {FileObject} fileObject - The file object containing file data.
   * @param {string|null} originalFileName - The original name of the file.
   * @returns {Promise<Files>} The saved file entity.
   */
  async saveFile(fileObject: FileObject, originalFileName: string | null = '') {
    // originalName must be full fileName (e.g. 'image.jpg')
    const { originalName, encoding, base64 } = fileObject;
    const file: Files = await this.create({ path: '' });
    const storagePath = path.join(config.storagePath, file.id.toString());

    if (!originalFileName) {
      originalFileName = originalName;
    }

    if (config.bucketUpload) {
      // Upload to S3 bucket
      await this.bucketProvider.uploadImage(base64, originalName);
    } else {
      // Save to Disk storage
      await fs.promises.mkdir(storagePath, {
        recursive: true,
      });
      const fileStoragePath = path.join(storagePath, originalName);
      fs.writeFile(fileStoragePath, base64, encoding, (err) => {
        if (err) {
          fs.rmSync(storagePath, { recursive: true });
        }
      });
    }

    await this.update(file.id, {
      id: file.id,
      path: path.join(file.id.toString(), originalName).replace(path.sep, '/'),
      original_name: originalFileName,
    });

    return file;
  }

  /**
   * Retrieves a file object from a file ID.
   * @param {number} fileId - The ID of the file to retrieve.
   * @returns {Promise<FileObject>} The file object containing base64 data and metadata.
   */
  async getFileObjectFromFileId(fileId: number) {
    const fileObject = {
      base64: '',
      extensionName: '',
      encoding: '',
      originalName: '',
    };
    if (config.bucketUpload) {
      const getFileData = await this.findOne({ where: { id: fileId } });
      const file = await this.bucketProvider.getImage(
        getFileData.original_name,
      );
      fileObject.base64 = file.Body.toString('base64');
      fileObject.extensionName = parse(getFileData.original_name).ext;
      fileObject.encoding = 'base64';
      fileObject.originalName = getFileData.original_name;
    } else {
      const filepath = this.getFilePathByFileId(fileId);
      const extensionName = parse(filepath).ext;
      const originalName = parse(filepath).base;
      const bufferFile = fs.readFileSync(filepath, { encoding: 'base64' });
      fileObject.base64 = bufferFile.toString();
      fileObject.extensionName = extensionName;
      fileObject.encoding = 'base64';
      fileObject.originalName = originalName;
    }
    return fileObject;
  }

  /**
   * Retrieves the file path for a given file ID.
   * @param {number} fileId - The ID of the file.
   * @returns {string|null} The file path or null if not found.
   */
  getFilePathByFileId(fileId: number) {
    try {
      const filepath = resolve(config.storagePath + '/' + fileId);
      const fileName = fs.readdirSync(filepath)[0];
      const finalPath = join(filepath, fileName);

      return finalPath;
    } catch (e) {
      console.error('getFilePathByFileId', e);
      return null;
    }
  }

  /**
   * Retrieves the file path for a given file ID.
   * @param {number} fileId - The ID of the file.
   * @returns {string|null} The file path or null if not found.
   */
  async getPathDetails(id: number) {
    const getFileName = await this.findOne({ where: { id } });

    if (!getFileName) {
      this.responseMsgService.addErrorMsg({
        message: 'record does not exist',
        type: 'error',
        show: true,
      });
      return { path: '', fileName: '', ext: '' };
    }
    const newFilePath = path.join(config.storagePath, getFileName.path);
    const ext = parse(newFilePath).ext.substring(1);

    return { path: newFilePath, fileName: getFileName.file, ext: ext };
  }

  /**
   * Extracts a file object from a base64 image string.
   * @param {string} base64String - The base64 string of the image.
   * @param {string} [encoding] - The encoding type.
   * @param {string} [filename] - The filename.
   * @returns {Promise<FileObject>} The file object.
   */
  async getFileObjectForBase64Image(
    base64String: string,
    encoding?: any,
    filename?: string,
  ) {
    const { base64, extensionName } = this.extractBase64img(base64String);
    const fileObject: FileObject = {
      base64: base64,
      encoding: encoding,
      originalName: this.getRandomFileName(`${filename}`) + extensionName,
    };
    return fileObject;
  }

  /**
   * Extracts a file object from a file buffer.
   * @param {any} file - The file buffer data.
   * @param {string} [encoding] - The encoding type.
   * @returns {Promise<FileObject>} The file object.
   */
  async getFileObjectForFileBufferData(file: any, encoding?: any) {
    const { base64 } = this.extractBase64FromPath(file.path);
    const fileObject: FileObject = {
      base64: base64,
      encoding: encoding,
      originalName: file.filename,
    };
    return fileObject;
  }

  /**
   * Updates a file by ID.
   * @param {number} fileId - The ID of the file to update.
   * @param {FileObject} fileObject - The new file object data.
   * @param {string|null} originalFileName - The original name of the file.
   * @returns {Promise<Files | boolean>} The updated file entity or false if update failed.
   */
  async updateFileById(
    fileId: number,
    fileObject: FileObject,
    originalFileName: string | null = '',
  ) {
    const getFileData = await this.findOne({ where: { id: fileId } });
    const { originalName, encoding, base64 } = fileObject;
    if (!originalFileName) {
      originalFileName = originalName;
    }
    const storagePath = path.join(config.storagePath, fileId.toString());
    const fileStoragePath = path.join(storagePath, originalName);

    if (config.bucketUpload) {
      await this.bucketProvider.uploadImage(base64, originalName);
      this.bucketProvider.deleteImage(getFileData.original_name);
    } else {
      const files = fs.readdirSync(storagePath);
      for (const file of files) {
        fs.unlinkSync(path.join(storagePath, file));
      }
      await fs.promises.mkdir(storagePath, {
        recursive: true,
      });
      fs.writeFile(fileStoragePath, base64, encoding, (err) => {
        if (err) {
          fs.rmSync(storagePath, { recursive: true });
        }
      });
    }

    const file = await this.update(fileId, {
      id: fileId,
      path: path.join(fileId.toString(), originalName).replace(path.sep, '/'),
      original_name: originalFileName,
    });
    return file;
  }

  /**
   * Updates a file by ID.
   * @param {number} fileId - The ID of the file to update.
   * @param {FileObject} fileObject - The new file object data.
   * @param {string|null} originalFileName - The original name of the file.
   * @returns {Promise<Files | boolean>} The updated file entity or false if update failed.
   */
  async getFileBase64FromUrl(imageUrl) {
    try {
      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
      });

      const imageBase64 = Buffer.from(response.data, 'binary').toString(
        'base64',
      );

      return imageBase64;
    } catch (error) {
      throw new Error(
        `Failed to fetch image and convert to base64: ${error.message}`,
      );
    }
  }

  /**
   * Retrieves the file size in kilobytes.
   * @param {string} filePath - The path to the file.
   * @returns {Promise<number>} The file size in kilobytes.
   */
  async getFileSize(filePath: string) {
    try {
      const fileInfo = await fs.promises.stat(filePath);
      const fileSizeInBytes = fileInfo.size;
      const fileSizeInKB = fileSizeInBytes / 1000;
      return fileSizeInKB;
    } catch (error) {
      throw new Error('Failed to get file size from image');
    }
  }

  /**
   * Removes a file by ID.
   * @param {number} fileId - The ID of the file to remove.
   * @returns {Promise<RemoveDto | boolean>} The remove result or false if removal failed.
   */
  async removeFile(fileId: number) {
    const storagePath = path.join(config.storagePath, fileId.toString());
    const getFileData = await this.findOne({ where: { id: fileId } });
    try {
      if (config.bucketUpload) {
        await this.bucketProvider.deleteImage(getFileData.original_name);
      } else {
        fs.rmSync(storagePath, { recursive: true, force: true });
      }
      const remove = await this.remove(fileId);
      return remove;
    } catch (e) {
      this.responseMsgService.addErrorMsg({
        message: e,
        type: 'error',
        show: true,
      });
      this.responseMsgService.isSuccess(false);
      return false;
    }
  }

  /**
   * Removes a file by ID.
   * @param {number} fileId - The ID of the file to remove.
   * @returns {Promise<RemoveDto | boolean>} The remove result or false if removal failed.
   */
  async getFile(id: string) {
    const getFileData = await this.findOne({ where: { id } });
    if (!getFileData) {
      this.responseMsgService.addErrorMsg({
        message: 'record does not exist',
        type: 'error',
        show: true,
      });
      return false;
    }
    return await this.bucketProvider.getImage(getFileData.original_name);
  }

  /**
   * Removes temporary files from the storage path.
   */
  async removeTempFiles() {
    const tempPath = config.storagePath + '/temp';
    fs.readdir(tempPath, (err, files) => {
      if (err) {
        console.error('removeTempFiles', err);
        return;
      }
      files.forEach((file) => {
        const data =
          new Date().getTime() -
          fs.statSync(tempPath + '/' + file).mtime.getTime();
        if (data > 1000 * 60 * 5) {
          fs.rmSync(tempPath + '/' + file);
        }
      });
    });
  }

  /**
   * Checks the image size and decreases its quality if it exceeds the specified file size.
   * @param {Jimp} image - The image to process.
   * @param {string} filePath - The path to the file.
   * @param {number} fileSize - The maximum file size in kilobytes.
   * @returns {Promise<string>} The new file path of the decreased quality image.
   */
  async checkImageSizeAndDecreaseImageQuality(
    image: Jimp,
    filePath: string,
    fileSize: number,
  ) {
    try {
      let sizeOfFile = await this.getFileSize(filePath);
      let quality = 100;
      let decreasedImage = image;
      let newFilePath = filePath;
      while (sizeOfFile > fileSize && quality > 0) {
        decreasedImage = decreasedImage.quality(quality);
        const newFile = await this.writeImageFile(decreasedImage, filePath);
        const fileSize = await this.getFileSize(newFile.fileName);
        sizeOfFile = fileSize;
        newFilePath = newFile.fileName;
        quality -= 2;
      }
      return newFilePath;
    } catch (e) {
      throw new Error('Failed to check image size and decrease image quality');
    }
  }

  /**
   * Extracts the base64 image data and its extension.
   * @param {string} data - The base64 image string.
   * @returns {Object} The extracted base64 data and extension.
   */
  extractBase64img = (data: string) => {
    const reg = /^data:image\/([\w+]+);base64,([\s\S]+)/;
    const match = data?.match(reg);
    const baseType = {
      jpeg: 'jpg',
    };
    baseType['svg+xml'] = 'svg';

    const extensionName = Array.isArray(match)
      ? baseType[match[1]]
        ? baseType[match[1]]
        : match[1]
      : '';

    return {
      extensionName: '.' + extensionName,
      base64: Array.isArray(match) ? match[2] : data,
    };
  };

  /**
   * Extracts base64 data from a file path.
   * @param {string} data - The file path.
   * @returns {Object} The extracted base64 data and extension.
   */
  //use for extract format and base64 string from path
  extractBase64FromPath = (data: string) => {
    const extensionName = parse(data);
    const file = fs.readFileSync(data, { encoding: 'base64' });
    return {
      extensionName: extensionName.ext,
      base64: file,
    };
  };

  /**
   * Extracts base64 data from a file path.
   * @param {string} data - The file path.
   * @returns {Object} The extracted base64 data and extension.
   */
  getRandomFileName(originalname: string) {
    const randomFileName = `${Date.now()}-${originalname}`;
    return randomFileName;
  }

  /**
   * Generates a unique file name based on the original name.
   * @param {Express.Multer.File} file - The file object.
   * @returns {string} The generated unique file name.
   */
  generateUniqueFileName(file: Express.Multer.File) {
    const randomFileName = `${Date.now()}-${file.originalname}`;
    return randomFileName;
  }

  /**
   * Retrieves the MIME type from a base64 string.
   * @param {string} data - The base64 string.
   * @returns {string|null} The MIME type or null if not found.
   */
  getMimeTypeFromBase64 = (data) => {
    const reg = /^data:([\w+\/]+);base64,([\s\S]+)/;
    const match = data?.match(reg);
    return match && match[1] ? match[1]?.split('/')[1] : null;
  };

  /**
   * Resizes an image to 100x150 pixels.
   * @param {Jimp} image - The image to resize.
   * @returns {Jimp} The resized image.
   */
  resizeImageFile(image: Jimp) {
    return image.resize(100, 150);
  }

  /**
   * Resizes an image to 100x150 pixels.
   * @param {Jimp} image - The image to resize.
   * @returns {Jimp} The resized image.
   */
  getContentType(fileExtension: string): string {
    switch (fileExtension.toLowerCase()) {
      case 'xml':
        return 'application/xml';
      case 'png':
      case 'jpg':
      case 'jpeg':
      case 'gif':
        return `image/${fileExtension}`;
      case 'mp4':
      case 'avi':
      case 'mov':
        return `video/${fileExtension}`;
      case 'mp3':
      case 'mpga':
        return `audio/mp3`;
      default:
        return 'application/octet-stream';
    }
  }

  /**
   * Writes an image to a file.
   * @param {Jimp} image - The image to write.
   * @param {string} filePath - The path to save the image.
   * @returns {Promise<Object>} The written image and its file path.
   */
  async writeImageFile(image: Jimp, filePath: string) {
    const fileName = `${filePath.split('.')[0]}.jpg`;
    return { image: await image.writeAsync(fileName), fileName: fileName };
  }
}
