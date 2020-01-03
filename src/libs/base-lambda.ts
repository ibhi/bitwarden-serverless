import { APIGatewayProxyResult } from 'aws-lambda';
import { Item } from 'dynogels';
import { sequenceS } from 'fp-ts/lib/Apply';
import * as E from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/pipeable';
import * as TE from 'fp-ts/lib/TaskEither';
import jwt from 'jsonwebtoken';

import { DeviceRepository } from './db/device-repository';
import { UserRepository } from './db/user-repository';

export interface UserDeviceContext {
  user: Item;
  device: Item;
}

interface JwtPayload {
  nbf: number;
  exp: number;
  iss: string;
  sub: string;
  premium: string;
  name: string;
  email: string;
  email_verified: string;
  sstamp: string;
  device: string;
  scope: string[];
  amr: string[];
}

export default abstract class BaseLambda {
  private static readonly JWT_DEFAULT_ALGORITHM = 'HS256';

  /**
 * Unless the Webvault runs on the same domain, it requires some custom CORS settings
 *
 * Pragma,Cache-Control are used by the revision date endpoints
 * Device-Type is used by login
 */
  public static readonly CORS_HEADERS = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers':
      'Content-Type,Authorization,Accept,Device-type,Pragma,Cache-Control',
  };

  constructor(
    protected userRepository: UserRepository,
    protected deviceRepository: DeviceRepository,
  ) {}

  async loadContextFromHeader(header): Promise<UserDeviceContext> {
    if (!header) {
      throw new Error('Missing Authorization header');
    }

    const token: string = header.replace(/^(Bearer)/, '').trim();
    const payload: JwtPayload = jwt.decode(token) as JwtPayload;
    const userUuid = payload.sub;
    const deviceUuid = payload.device;
    const user = await this.userRepository.getUserById(userUuid);
    const device = await this.deviceRepository.getDeviceById(userUuid, deviceUuid);

    if (!user || !device) {
      throw new Error('User or device not found from token');
    }

    // Throws on error
    jwt.verify(token, user.get('jwtSecret'), { algorithms: [BaseLambda.JWT_DEFAULT_ALGORITHM] });

    if (payload.sstamp !== user.get('securityStamp')) {
      throw new Error('You need to login again after recent profile changes');
    }

    return { user, device };
  }

  protected createTaskEitherFromPromise = <T>(
    promise: Promise<T>,
  ): TE.TaskEither<Error, T> => TE.tryCatch(
    () => promise,
    E.toError,
  );

  protected loadContext = (
    authHeader: string | null | undefined,
  ): TE.TaskEither<Error, { user: Item; device: Item }> => pipe(
    authHeader, // string | null | undefined
    E.fromNullable(new Error('Missing Authorization header')), // Either<Error, NonNullable<string>>
    E.map((header) => header.replace(/^(Bearer)/, '').trim()), // Either<Error, string>
    E.map((token) => jwt.decode(token) as JwtPayload), // Either<Error, JwtPayload>
    E.map((payload) => [payload.sub, payload.device]), // Either<Error, string[]>
    TE.fromEither, // TaskEither<Error, string[]>
    TE.map(([userUuid, deviceUuid]) => ({
      user: this.createTaskEitherFromPromise(
        this.userRepository.getUserById(userUuid),
      ),
      device: this.createTaskEitherFromPromise(
        this.deviceRepository.getDeviceById(userUuid, deviceUuid),
      ),
    })), // TaskEither<Error, { user: TaskEither<Error, Item>, device: TaskEither<Error, Item> }>
    TE.chain((taskEitherObj) => sequenceS(TE.taskEither)(taskEitherObj)),
    // TaskEither<Error, { user: Item; device: Item }>
  );

  private parseJson = <T>(body: string): E.Either<Error, T> => E.tryCatch(
    () => JSON.parse(body) as T,
    E.toError,
  );

  protected parseRequestBody = <T>(
    bodyJson: string | null | undefined,
  ): E.Either<Error, T> => pipe(
    bodyJson,
    E.fromNullable(new Error('Request body is missing!')),
    E.chain(this.parseJson),
    E.map(this.normalizeBody),
  );

  okResponse(body): APIGatewayProxyResult {
    console.log('Success response', { body });
    return {
      statusCode: 200,
      headers: BaseLambda.CORS_HEADERS,
      body: typeof body === 'string' ? body : JSON.stringify(body),
    };
  }

  validationError(message: string): APIGatewayProxyResult {
    console.log('Validation error', { message });
    return {
      statusCode: 400,
      headers: BaseLambda.CORS_HEADERS,
      body: JSON.stringify({
        ValidationErrors: {
          '': [
            message,
          ],
        },
        Object: 'error',
      }),
    };
  }

  serverError(message: string, error: Error): APIGatewayProxyResult {
    console.log('Server error', { message, error });
    return {
      statusCode: 500,
      headers: BaseLambda.CORS_HEADERS,
      body: JSON.stringify({
        Message: message,
        Object: 'error',
      }),
    };
  }

  /**
   * Bitwarden has a very loosely enforced API in terms of case-sensitivity
   * The API accepts any case and clients actually send a mix
   * For compatibility, we just use lowercase everywhere
   */
  normalizeBody<T = any>(body): T {
    const normalized = {};
    Object.keys(body).forEach((key) => {
      normalized[key.toLowerCase()] = body[key];
    });

    return normalized as T;
  }
}
