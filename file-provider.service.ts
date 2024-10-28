import { BadRequestException, Injectable } from "@nestjs/common";
import * as fs from "fs";
import * as path from "path";
import { join, parse, resolve } from "path";
import Jimp from "jimp";
import { ResponseMsgService } from "../../../commons";
import { BucketProvider } from "../bucket-provider/bucket-provider.service";
import { config } from "../../../commons/config";
import { FileObject, FileUrl, Files, UploadObject } from "./dto/file-object";
import { FILE_UPLOAD_TYPE } from "./constant";

@Injectable()
export class FileProvider {
  constructor(
    protected responseMsgService: ResponseMsgService,
    protected bucketProvider: BucketProvider
  ) {}

  /**
   * Saves a file to storage (local or S3).
   *
   * This function stores a file either locally or in an S3 bucket, depending on configuration.
   * If S3 is used, it utilizes base64 encoding; if local, it creates a directory for storage.
   *
   * @param {UploadObject} fileObject - The file object containing file data.
   * @param {string|null} fileId - The ID of the file.
   */
  async uploadFiles(fileObject: UploadObject, fileId: number) {
    const { originalName, encoding, base64 } = fileObject; // originalName should be :  'filename.ext'
    const storagePath = path.join(config.DISK_STORAGE_PATH, fileId.toString());
    const fileStoragePath = path.join(storagePath, originalName);

    try {
      if (config.STORAGE_TYPE === FILE_UPLOAD_TYPE.BUCKET) {
        // Upload to S3 bucket
        const fileName = `${fileId}/${originalName}`;
        const contentType = this.getContentType(
          parse(originalName).ext.substring(1)
        );
        await this.bucketProvider.uploadFile(base64, fileName, contentType);
      } else {
        // Save to Disk storage
        await fs.promises.mkdir(storagePath, {
          recursive: true,
        });

        fs.writeFile(fileStoragePath, base64, encoding, (err) => {
          if (err) {
            fs.rmSync(storagePath, { recursive: true });
          }
        });
      }
    } catch (error) {
      console.error("Error saving file:", error);
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Retrieves a file from disk or S3.
   *
   * This function fetches a file from either local storage or an S3 bucket.
   * It returns the URL of the file or false if the retrieval fails.
   *
   * @param {Files} fileData - The file object containing file data.
   * @param {string} hostURL - The URL of the host server.
   * @param {number} [expiresIn] - URL expiration time for S3 links.
   */
  async getFile(fileData: Files, hostURL: string, expiresIn?: number) {
    if (config.STORAGE_TYPE === FILE_UPLOAD_TYPE.BUCKET) {
      const path = fileData.id + "/" + fileData.original_name;
      const url = await this.bucketProvider.getPresignedUrlOfFile(
        path,
        expiresIn
      );
      return url;
    } else {
      return hostURL + "/file/" + fileData.id;
    }
  }

  /**
   * Retrieves file details in base64 format.
   *
   * Gets the file’s base64 string, extension, encoding, and name from either local storage or S3.
   *
   * @param {Files} fileData - The file object containing file data.
   * @returns {Object} The file details including base64, extension, encoding, and original name.
   */
  async getFileDetails(fileData: Files) {
    const fileObject = {
      base64: "",
      extensionName: "",
      encoding: "",
      originalName: "",
      path: "",
    };
    if (config.STORAGE_TYPE === FILE_UPLOAD_TYPE.BUCKET) {
      const fileName = fileData.id + "/" + fileData.original_name;
      const file = await this.bucketProvider.getFile(fileName);
      fileObject.base64 = file;
      fileObject.extensionName = parse(fileData.original_name).ext;
      fileObject.encoding = "base64";
      fileObject.originalName = fileData.original_name;
    } else {
      const filepath = this.getFilePathByFileId(fileData.id);
      if (!filepath) {
        return null;
      }
      const extensionName = parse(filepath).ext;
      const originalName = parse(filepath).base;
      const bufferFile = fs.readFileSync(filepath, { encoding: "base64" });
      fileObject.base64 = bufferFile.toString();
      fileObject.extensionName = extensionName;
      fileObject.encoding = "base64";
      fileObject.originalName = originalName;
      fileObject.path = filepath;
    }
    return fileObject;
  }

  /**
   * Retrieves the file path for a given file ID.
   *
   * Searches the storage directory for a file using its ID. Returns the full file path or null if not found.
   *
   * @param {number} fileId - The ID of the file.
   * @returns {string|null} The file path or null if not found.
   */
  getFilePathByFileId(fileId: number): string | null {
    try {
      const filepath = resolve(config.DISK_STORAGE_PATH + "/" + fileId);
      const fileName = fs.readdirSync(filepath)[0];
      const finalPath = join(filepath, fileName);

      return finalPath;
    } catch (e) {
      console.error("getFilePathByFileId", e);
      return null;
    }
  }

  /**
   * Updates an existing file in storage (local or S3).
   *
   * Replaces an existing file with a new file in local storage or in the S3 bucket.
   *
   * @param {FileObject} fileObject - The file object containing updated file data.
   * @param {number} fileId - The ID of the file to update.
   */
  async updateFile(fileObject: FileObject, fileId: number) {
    const { originalName, encoding, base64 } = fileObject;

    try {
      if (config.STORAGE_TYPE === FILE_UPLOAD_TYPE.BUCKET) {
        const fileName = `${fileId}/${originalName}`;
        const contentType = this.getContentType(
          parse(originalName).ext.substring(1)
        );
        await this.bucketProvider.uploadFile(base64, fileName, contentType);
      } else {
        const storagePath = path.join(
          config.DISK_STORAGE_PATH,
          fileId.toString()
        );
        const fileStoragePath = path.join(storagePath, originalName);
        const files = fs.readdirSync(storagePath);
        //Remove Old file from disk storage
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
    } catch (error) {
      console.error("Error saving file:", error);
      throw new BadRequestException(error.message);
    }
  }

  /**
   * Deletes a file from local storage or S3.
   *
   * This function removes a file from either local storage or S3, depending on the configuration.
   *
   * @param {Files} fileData - The file object containing file data.
   */
  async deleteFile(fileData: Files) {
    const storagePath = path.join(
      config.DISK_STORAGE_PATH,
      fileData.id.toString()
    );
    if (config.STORAGE_TYPE === FILE_UPLOAD_TYPE.BUCKET) {
      const fileName = fileData.id + "/" + fileData.original_name;
      await this.bucketProvider.deleteFile(fileName);
    } else {
      fs.rmSync(storagePath, { recursive: true, force: true });
    }
  }

  /**
   * Extracts a file object from a base64 image string.
   *
   * Parses a base64 image string and returns it as a file object, with optional encoding and filename.
   *
   * @param {string} base64String - The base64 string of the image.
   * @param {string} [encoding] - The encoding type.
   * @param {string} [filename] - The filename.
   * @returns {Promise<FileObject>} The file object.
   */
  getFileObjectForBase64Image(
    base64String: string,
    encoding?: any,
    filename?: string
  ): FileObject {
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
   *
   * Converts a file buffer to a base64 file object.
   *
   * @param {any} file - The file buffer data.
   * @param {string} [encoding] - The encoding type.
   * @returns {Promise<FileObject>} The file object.
   */
  async getFileObjectForFileBufferData(
    file: any,
    encoding?: any
  ): Promise<FileObject | null> {
    const data = this.extractBase64FromPath(file.path);
    if (!data) {
      return null;
    }
    const fileObject: FileObject = {
      base64: data.base64,
      encoding: encoding,
      originalName: file.filename,
    };
    return fileObject;
  }

  /**
   * Extracts the base64 image data and its extension.
   *
   * Parses a base64 image string and retrieves the base64 data and file extension.
   *
   * @param {string} data - The base64 image string.
   * @returns {Object} The extracted base64 data and extension.
   */
  extractBase64img = (data: string) => {
    const reg = /^data:image\/([\w+]+);base64,([\s\S]+)/;
    const match = data?.match(reg);
    const baseType = {
      jpeg: "jpg",
    };
    baseType["svg+xml"] = "svg";

    const extensionName = Array.isArray(match)
      ? baseType[match[1]]
        ? baseType[match[1]]
        : match[1]
      : "";

    return {
      extensionName: "." + extensionName,
      base64: Array.isArray(match) ? match[2] : data,
    };
  };

  /**
   * Extracts base64 data from a file path.
   *
   * Retrieves base64-encoded data and extension from a file at a given path.
   *
   * @param {string} path - The file path.
   * @returns {Object} The extracted base64 data and extension.
   */
  extractBase64FromPath = (path: string) => {
    try {
      if (!fs.existsSync(path)) {
        throw new Error("File does not exist");
      }
      const { ext } = parse(path);
      const file = fs.readFileSync(path, { encoding: "base64" });
      return {
        extensionName: ext,
        base64: file,
      };
    } catch (error) {
      console.error("Error extracting base64 from path:", error.message);
      return null;
    }
  };

  /**
   * Generates a random file name based on the original name.
   *
   * @param {string} originalname - The file path.
   * @returns {string} A random filename based on the timestamp.
   */
  getRandomFileName(originalname: string): string {
    const randomFileName = `${Date.now()}-${originalname}`;
    return randomFileName;
  }

  /**
   * Generates a unique file name for storage.
   *
   * @param {Express.Multer.File} file - The file object.
   * @returns {string} The generated unique file name.
   */
  generateUniqueFileName(file: Express.Multer.File): string {
    const randomFileName = `${Date.now()}-${file.originalname}`;
    return randomFileName;
  }

  /**
   * Determines the MIME content type based on file extension.
   *
   * @param {string} fileExtension - The file extension.
   * @returns {string} The determined content type.
   */
  getContentType(fileExtension: string): string {
    switch (fileExtension.toLowerCase()) {
      case "xml":
        return "application/xml";
      case "png":
      case "jpg":
      case "jpeg":
      case "gif":
        return `image/${fileExtension}`;
      case "mp4":
      case "avi":
      case "mov":
        return `video/${fileExtension}`;
      case "mp3":
      case "mpga":
        return `audio/mp3`;
      case "pdf":
        return "application/pdf";
      default:
        return "application/octet-stream";
    }
  }

  /**
   * Retrieves the MIME type from a base64 string.
   *
   * @param {string} data - The base64 string.
   * @returns {string|null} The MIME type or null if not found.
   */
  getMimeTypeFromBase64 = (data: string): string | null => {
    const reg = /^data:([\w+\/]+);base64,([\s\S]+)/;
    const match = data?.match(reg);
    return match && match[1] ? match[1]?.split("/")[1] : null;
  };

  /**
   * Removes temporary files from the storage path.
   *
   * Deletes files older than five minutes from the temporary directory.
   */
  async removeTempFiles() {
    const tempPath = config.DISK_STORAGE_PATH + "/temp";
    fs.readdir(tempPath, (err, files) => {
      if (err) {
        console.error("removeTempFiles", err);
        return;
      }
      files.forEach((file) => {
        const data =
          new Date().getTime() -
          fs.statSync(tempPath + "/" + file).mtime.getTime();
        if (data > 1000 * 60 * 5) {
          fs.rmSync(tempPath + "/" + file);
        }
      });
    });
  }

  /**
   * Retrieves the file size in kilobytes.
   *
   * Obtains the file size in kilobytes for a specified file.
   *
   * @param {string} filePath - The path to the file.
   * @returns {Promise<number>} The file size in kilobytes.
   */
  async getFileSize(filePath: string): Promise<number> {
    try {
      const fileInfo = await fs.promises.stat(filePath);
      const fileSizeInBytes = fileInfo.size;
      const fileSizeInKB = fileSizeInBytes / 1000;
      return fileSizeInKB;
    } catch (error) {
      throw new Error("Failed to get file size from image");
    }
  }

  /**
   * Checks and adjusts the quality of an image if it exceeds a specified size.
   *
   * Compresses an image’s quality in 2% increments until it meets a target size in kilobytes.
   *
   * @param {Jimp} image - The image to process.
   * @param {string} filePath - The path to the file.
   * @param {number} fileSize - The maximum file size in kilobytes.
   * @returns {Promise<string>} The new file path of the compressed image.
   */
  async checkImageSizeAndDecreaseImageQuality(
    image: Jimp,
    filePath: string,
    fileSize: number
  ): Promise<string> {
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
      throw new Error("Failed to check image size and decrease image quality");
    }
  }

  /**
   * Writes an image file to the specified path.
   *
   * Saves an image to a path on disk and returns the saved file’s details.
   *
   * @param {Jimp} image - The image to write.
   * @param {string} filePath - The path to save the image.
   * @returns {Promise<any>} The written image and file name.
   */
  async writeImageFile(image: Jimp, filePath: string): Promise<any> {
    const fileName = `${filePath.split(".")[0]}.jpg`;
    return { image: await image.writeAsync(fileName), fileName: fileName };
  }

  /**
   * Retrieves multiple file URLs.
   *
   * Generates presigned URLs for multiple files with an expiration based on file count.
   *
   * @param {Files[]} fileData - Array of file data objects.
   * @param {string} hostURL - The host URL for local storage files.
   * @returns {Promise<FileUrl[]>} Array of file URLs with IDs.
   */
  async getMultipleFiles(
    fileData: Files[],
    hostURL: string
  ): Promise<FileUrl[]> {
    const urls: FileUrl[] = [];
    // Calculate expiration time based on the number of files, with a maximum of 60 seconds
    const expireInTime = fileData.length * 5 <= 60 ? fileData.length * 5 : 60;
    for (const file of fileData) {
      const url = await this.getFile(file, hostURL, expireInTime);
      if (url) {
        urls.push({ id: file.id, url: url });
      }
    }
    return urls;
  }
}
