import { ObjectId } from 'mongodb';
import mime from 'mime-types';
import Queue from 'bull';
import userUtils from '../utils/user';
import fileUtils from '../utils/file';
import basicUtils from '../utils/basic';

const FOLDER_PATH = process.env.FOLDER_PATH || '/tmp/files_manager';

const fileQueue = new Queue('fileQueue');

class FilesController {
  /**
   * Uploads a new file or folder to the system.
   *
   * Validates the request body, checks for missing fields or errors,
   * and stores the file/folder both in the database and locally (if needed).
   * 
   * The file can be:
   * - a folder (no content required),
   * - a file or image (requires Base64 data).
   *
   * If any validation fails (e.g., missing parameters, invalid parent ID, invalid type),
   * the response returns a relevant error message with a 400 status code.
   * 
   * If everything is valid:
   * - The file data is saved in the database.
   * - If the type is 'folder', it's saved as a folder.
   * - Otherwise, the file data is stored locally in the specified directory.
   * 
   * Returns the newly created file document with a 201 status code.
   */
  static async postUpload(request, response) {
    const { userId } = await userUtils.getUserIdAndKey(request);

    // Unauthorized if user ID is invalid
    if (!basicUtils.isValidId(userId)) {
      return response.status(401).send({ error: 'Unauthorized' });
    }

    if (!userId && request.body.type === 'image') {
      await fileQueue.add({});
    }

    const user = await userUtils.getUser({
      _id: ObjectId(userId),
    });

    // Unauthorized if the user doesn't exist
    if (!user) return response.status(401).send({ error: 'Unauthorized' });

    // Validate the body content (e.g., name, type, data, parentId)
    const { error: validationError, fileParams } = await fileUtils.validateBody(request);
    if (validationError) { return response.status(400).send({ error: validationError }); }

    // Validate parentId if it's not 0 (root)
    if (fileParams.parentId !== 0 && !basicUtils.isValidId(fileParams.parentId)) { 
      return response.status(400).send({ error: 'Parent not found' }); 
    }

    // Attempt to save the file and return any error encountered
    const { error, code, newFile } = await fileUtils.saveFile(
      userId,
      fileParams,
      FOLDER_PATH,
    );

    if (error) {
      // If an error occurs and the file is an image, enqueue for processing
      if (request.body.type === 'image') await fileQueue.add({ userId });
      return response.status(code).send(error);
    }

    // If the type is 'image', enqueue it for further processing
    if (fileParams.type === 'image') {
      await fileQueue.add({
        fileId: newFile.id.toString(),
        userId: newFile.userId.toString(),
      });
    }

    // Return the newly created file document
    return response.status(201).send(newFile);
  }

  /**
   * Retrieves a file document based on the provided ID.
   *
   * - Verifies the user using the token.
   * - If the file ID is not valid or not found, returns a 404 status.
   * - Returns the file document with status 200 if the file is found and belongs to the user.
   */
  static async getShow(request, response) {
    const fileId = request.params.id;
    const { userId } = await userUtils.getUserIdAndKey(request);

    const user = await userUtils.getUser({ _id: ObjectId(userId) });

    // Unauthorized if the user doesn't exist
    if (!user) return response.status(401).send({ error: 'Unauthorized' });

    // Check for valid file and user IDs
    if (!basicUtils.isValidId(fileId) || !basicUtils.isValidId(userId)) {
      return response.status(404).send({ error: 'Not found' });
    }

    // Attempt to fetch the file document from the database
    const result = await fileUtils.getFile({
      _id: ObjectId(fileId),
      userId: ObjectId(userId),
    });

    if (!result) return response.status(404).send({ error: 'Not found' });

    // Process and return the file data
    const file = fileUtils.processFile(result);
    return response.status(200).send(file);
  }

  /**
   * Retrieves all files for a specific parentId with pagination.
   *
   * - Verifies the user using the token.
   * - Retrieves files based on the parentId and the page query parameter.
   * - Each page returns up to 20 files.
   * - If the parentId does not exist or is not a folder, returns an empty list.
   */
  static async getIndex(request, response) {
    const { userId } = await userUtils.getUserIdAndKey(request);
    const user = await userUtils.getUser({ _id: ObjectId(userId) });

    // Unauthorized if the user doesn't exist
    if (!user) return response.status(401).send({ error: 'Unauthorized' });

    let parentId = request.query.parentId || '0';
    if (parentId === '0') parentId = 0; // Default to root folder

    let page = Number(request.query.page) || 0;
    if (Number.isNaN(page)) page = 0;

    // Validate parent folder and ensure it's a folder type
    if (parentId !== 0 && parentId !== '0') {
      if (!basicUtils.isValidId(parentId)) { return response.status(401).send({ error: 'Unauthorized' }); }

      parentId = ObjectId(parentId);
      const folder = await fileUtils.getFile({ _id: ObjectId(parentId) });
      if (!folder || folder.type !== 'folder') { return response.status(200).send([]); }
    }

    // MongoDB aggregation pipeline to fetch files with pagination
    const pipeline = [
      { $match: { parentId } },
      { $skip: page * 20 },
      { $limit: 20 },
    ];

    const fileCursor = await fileUtils.getFilesOfParentId(pipeline);
    const fileList = [];
    
    // Process each file in the result cursor
    await fileCursor.forEach((doc) => {
      const document = fileUtils.processFile(doc);
      fileList.push(document);
    });

    // Return the list of files
    return response.status(200).send(fileList);
  }

  /**
   * Publishes a file by setting its 'isPublic' field to true.
   *
   * - Verifies the user and file ownership.
   * - If successful, updates the file and returns the updated file document.
   * - Returns an error if the file is not found or if the user is unauthorized.
   */
  static async putPublish(request, response) {
    const { error, code, updatedFile } = await fileUtils.publishUnpublish(
      request,
      true,
    );

    if (error) return response.status(code).send({ error });

    return response.status(code).send(updatedFile);
  }

  /**
   * Unpublishes a file by setting its 'isPublic' field to false.
   *
   * - Verifies the user and file ownership.
   * - If successful, updates the file and returns the updated file document.
   * - Returns an error if the file is not found or if the user is unauthorized.
   */
  static async putUnpublish(request, response) {
    const { error, code, updatedFile } = await fileUtils.publishUnpublish(
      request,
      false,
    );

    if (error) return response.status(code).send({ error });

    return response.status(code).send(updatedFile);
  }

  /**
   * Returns the content of a file based on its ID.
   *
   * - Verifies if the file is public or if the user is the owner.
   * - If the file is a folder, returns a 400 error.
   * - If the file is not found or is not public, returns a 404 error.
   * - If the file is found, retrieves the MIME type and returns the file data.
   */
  static async getFile(request, response) {
    const { userId } = await userUtils.getUserIdAndKey(request);
    const { id: fileId } = request.params;
    const size = request.query.size || 0;

    // Validate the file ID
    if (!basicUtils.isValidId(fileId)) { return response.status(404).send({ error: 'Not found' }); }

    // Fetch the file from the database
    const file = await fileUtils.getFile({
      _id: ObjectId(fileId),
    });

    // Check if the file is public or if the user is the owner
    if (!file || !fileUtils.isOwnerAndPublic(file, userId)) { return response.status(404).send({ error: 'Not found' }); }

    // If the file is a folder, return an error
    if (file.type === 'folder') {
      return response.status(400).send({ error: "A folder doesn't have content" });
    }

    // Fetch and return the file data with the appropriate MIME type
    const { error, code, data } = await fileUtils.getFileData(file, size);
    if (error) return response.status(code).send({ error });

    const mimeType = mime.contentType(file.name);
    response.setHeader('Content-Type', mimeType);

    return response.status(200).send(data);
  }
}

export default FilesController;

