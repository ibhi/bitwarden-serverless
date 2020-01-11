import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as E from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/pipeable';
import * as TE from 'fp-ts/lib/TaskEither';

import { Item } from 'dynogels';
import BaseLambda from '../../libs/base-lambda';
import { deviceRepository } from '../../libs/db/device-repository';
import { userRepository } from '../../libs/db/user-repository';
import { KDF_PBKDF2, KDF_PBKDF2_ITERATIONS_DEFAULT } from '../../libs/lib/crypto';

interface RequestBody {
  email: string;
}

export class PreloginLambda extends BaseLambda {
  public handler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
    console.log('Prelogin handler triggered', JSON.stringify(event, null, 2));

    const bodyEither: E.Either<APIGatewayProxyResult, RequestBody> = this
      .parseJsonRequestBody(event.body);

    const userTaskEither = pipe(
      bodyEither,
      TE.fromEither,
      TE.chain((body: RequestBody) => this.createTaskEitherFromPromise(
        this.userRepository.getUserByEmail(body.email),
      )),
    );

    return userTaskEither().then(
      (userEither: E.Either<APIGatewayProxyResult, Item>) => pipe(
        userEither,
        E.fold(
          (error: APIGatewayProxyResult) => error,
          (user: Item) => this.okResponse({
            Kdf: user.get('kdfType') || KDF_PBKDF2,
            KdfIterations: user.get('kdfIterations') || KDF_PBKDF2_ITERATIONS_DEFAULT,
          }),
        ),
      ),
    );
  };
}

export const preloginLambda = new PreloginLambda(userRepository, deviceRepository);
export const { handler } = preloginLambda;
