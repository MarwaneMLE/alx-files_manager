import express from 'express';
import AppController from '../controllers/AppController';
import UsersController from '../controllers/UsersController';
import AuthController from '../controllers/AuthController';
import FilesController from '../controllers/FilesController';

function controllerRouting(app) {
  const router = express.Router();
  app.use('/', router);

  // App Controller Routes

  // Returns the status of Redis and the database connection
  router.get('/status', (req, res) => {
    AppController.getStatus(req, res);
  });

  // Returns statistics about the number of users and files in the database
  router.get('/stats', (req, res) => {
    AppController.getStats(req, res);
  });

  // User Controller Routes

  // Creates a new user in the database
  router.post('/users', (req, res) => {
    UsersController.postNew(req, res);
  });

  // Retrieves information about the authenticated user based on the token
  router.get('/users/me', (req, res) => {
    UsersController.getMe(req, res);
  });

  // Auth Controller Routes

  // Signs in the user by generating a new authentication token
  router.get('/connect', (req, res) => {
    AuthController.getConnect(req, res);
  });

  // Signs out the user based on the provided token
  router.get('/disconnect', (req, res) => {
    AuthController.getDisconnect(req, res);
  });

  // Files Controller Routes

  // Uploads a new file to both the database and disk
  router.post('/files', (req, res) => {
    FilesController.postUpload(req, res);
  });

  // Retrieves the file document by its ID
  router.get('/files/:id', (req, res) => {
    FilesController.getShow(req, res);
  });

  // Retrieves all files for a specific user with pagination, based on the parentId
  router.get('/files', (req, res) => {
    FilesController.getIndex(req, res);
  });

  // Makes the file public by setting 'isPublic' to true
  router.put('/files/:id/publish', (req, res) => {
    FilesController.putPublish(req, res);
  });

  // Makes the file private by setting 'isPublic' to false
  router.put('/files/:id/unpublish', (req, res) => {
    FilesController.putUnpublish(req, res);
  });

  // Returns the file content by its ID
  router.get('/files/:id/data', (req, res) => {
    FilesController.getFile(req, res);
  });
}

export default controllerRouting;
