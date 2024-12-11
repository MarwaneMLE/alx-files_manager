import { ObjectId } from 'mongodb';
import sha1 from 'sha1';
import Queue from 'bull';
import dbClient from '../utils/db';
import userUtils from '../utils/user';

const userQueue = new Queue('userQueue');

class UsersController {
  /**
   * Creates a new user with an email and password.
   * 
   * The user creation process requires an email and a password:
   * - If the email is missing, return a 400 status code with an error message "Missing email".
   * - If the password is missing, return a 400 status code with an error message "Missing password".
   * - If the email already exists in the database, return a 400 status code with an error message "Already exist".
   * 
   * The password is hashed using the SHA1 algorithm before being saved.
   * 
   * Upon successful creation, a new user document is saved to the database with the following:
   * - email: The provided email address.
   * - password: The hashed password (SHA1 value of the provided password).
   * 
   * Returns a 201 status code with the new user's id and email.
   */
  static async postNew(request, response) {
    const { email, password } = request.body;

    // Check if email is provided
    if (!email) return response.status(400).send({ error: 'Missing email' });

    // Check if password is provided
    if (!password) {
      return response.status(400).send({ error: 'Missing password' });
    }

    // Check if email already exists in the database
    const emailExists = await dbClient.usersCollection.findOne({ email });
    if (emailExists) {
      return response.status(400).send({ error: 'Already exist' });
    }

    // Hash the password using SHA1
    const sha1Password = sha1(password);

    let result;
    try {
      // Insert the new user into the database
      result = await dbClient.usersCollection.insertOne({
        email,
        password: sha1Password,
      });
    } catch (err) {
      // If there's an error, enqueue a task to handle it asynchronously
      await userQueue.add({});
      return response.status(500).send({ error: 'Error creating user.' });
    }

    // Prepare the user object to send in the response (only email and id)
    const user = {
      id: result.insertedId,
      email,
    };

    // Add the user ID to the queue for further processing
    await userQueue.add({
      userId: result.insertedId.toString(),
    });

    // Respond with the newly created user object and a 201 status code
    return response.status(201).send(user);
  }

  /**
   * Retrieves the authenticated user based on the token provided.
   *
   * This endpoint expects a valid token to be provided:
   * - If the user is not found (invalid token or no user associated), return a 401 status code with an "Unauthorized" error.
   * - If the user is found, return a response with the user's id and email (excluding sensitive information like password).
   *
   * Returns the user object in the following format:
   * { id: <userId>, email: <userEmail> }
   */
  static async getMe(request, response) {
    // Extract userId from the token (provided in request)
    const { userId } = await userUtils.getUserIdAndKey(request);

    // Retrieve user details from the database using the userId
    const user = await userUtils.getUser({
      _id: ObjectId(userId),
    });

    // If user not found, respond with Unauthorized error
    if (!user) return response.status(401).send({ error: 'Unauthorized' });

    // Prepare the user object to send in the response (only id and email)
    const processedUser = { id: user._id, ...user };
    delete processedUser._id; // Remove _id field from response
    delete processedUser.password; // Remove password field from response

    // Respond with the user's id and email
    return response.status(200).send(processedUser);
  }
}

export default UsersController;

