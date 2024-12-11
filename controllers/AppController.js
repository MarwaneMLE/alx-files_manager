import redisClient from '../utils/redis';
import dbClient from '../utils/db';

class AppController {
  /**
   * Handles the /status route.
   * Returns the health status of both Redis and the database.
   * Uses the utility functions from 'redisClient' and 'dbClient' to check if they are alive.
   * Responds with a JSON object indicating the status of Redis and the database.
   * Example response: { "redis": true, "db": true }
   * Returns a status code of 200 if both services are running.
   */
  static getStatus(request, response) {
    const status = {
      redis: redisClient.isAlive(),
      db: dbClient.isAlive(),
    };
    response.status(200).send(status);
  }

  /**
   * Handles the /stats route.
   * Retrieves and returns the current number of users and files in the database.
   * The statistics are fetched using the dbClient's methods for counting users and files.
   * Example response: { "users": 12, "files": 1231 }
   * Returns a status code of 200 along with the statistics.
   */
  static async getStats(request, response) {
    const stats = {
      users: await dbClient.nbUsers(),
      files: await dbClient.nbFiles(),
    };
    response.status(200).send(stats);
  }
}

export default AppController;
