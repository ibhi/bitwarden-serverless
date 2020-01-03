import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Item } from 'dynogels';
import { sequenceS } from 'fp-ts/lib/Apply';
import * as E from 'fp-ts/lib/Either';
import * as O from 'fp-ts/lib/Option';
import { pipe } from 'fp-ts/lib/pipeable';
import * as TE from 'fp-ts/lib/TaskEither';

import BaseLambda from '../../libs/base-lambda';
import { deviceRepository } from '../../libs/db/device-repository';
import { userRepository } from '../../libs/db/user-repository';
import { getRevisionDateAsMillis, mapUser } from '../../libs/lib/mappers';


interface PutRequestBody {
  masterpasswordhint: string;
  name: string;
  culture: string;
}

export class ProfileLambda extends BaseLambda {
  profileHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
    console.log('Account profile handler triggered', JSON.stringify(event, null, 2));

    const userTaskEither: TE.TaskEither<Error, Item> = pipe(
      event.headers.Authorization,
      this.loadContext,
      TE.map(({ user }) => user),
    );
    // Invoke TaskEither to get a promise of type Either<Error, T>
    // and fold over the either to get the values out of it
    return userTaskEither().then((either) => pipe(
      either,
      E.fold(
        (error) => this.serverError(`Error: ${error.message}`, error),
        (user) => this.okResponse(mapUser(user)),
      ),
    ));
  };


  putProfileHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
    console.log('Update account profile handler triggered', JSON.stringify(event, null, 2));

    const userTaskEither: TE.TaskEither<Error, Item> = pipe(
      event.headers.Authorization,
      this.loadContext,
      TE.map(({ user }) => user),
    );

    const bodyEither: E.Either<Error, PutRequestBody> = this.parseRequestBody(event.body);

    const setUserDocument = ({ body, user }: {body: PutRequestBody; user: Item}): Item => [
      ['masterpasswordhint', 'passwordHint'], ['name', 'name'], ['culture', 'culture'],
    ]
      .reduce((usr, [requestAttr, attr]) => pipe(
        body[requestAttr] as string | null,
        O.fromNullable,
        O.map(() => usr.set({ [attr]: body[requestAttr] })),
        O.fold(
          () => user,
          () => usr,
        ),
      ), user);

    const updateUserDocument = (
      userTE: TE.TaskEither<Error, Item>,
      bodyE: E.Either<Error, PutRequestBody>,
    ): TE.TaskEither<Error, Item> => pipe(
      {
        user: userTE,
        body: TE.fromEither(bodyE),
      },
      sequenceS(TE.taskEither),
      TE.map(setUserDocument),
      TE.chain((user) => this.createTaskEitherFromPromise(user.updateAsync())),
    );

    return updateUserDocument(userTaskEither, bodyEither)()
      .then((userEither: E.Either<Error, Item>) => pipe(
        userEither,
        E.fold(
          (error) => this.serverError(`Error: ${error.message}`, error),
          (user) => this.okResponse(mapUser(user)),
        ),
      ));
  };

  revisionDateHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
    console.log('Account revision date handler triggered', JSON.stringify(event, null, 2));

    const getUser: TE.TaskEither<Error, Item> = pipe(
      event.headers.Authorization,
      this.loadContext,
      TE.map(({ user }) => user),
    );
    const okResponse = (user: Item): APIGatewayProxyResult => ({
      ...this.okResponse(String(getRevisionDateAsMillis(user))),
      headers: Object.assign(BaseLambda.CORS_HEADERS, {
        'Content-Type': 'text/plain',
      }),
    });
    // Invoke TaskEither to get a promise of type Either<Error, T>
    // and fold over the either to get the values out of it
    return getUser().then((either) => pipe(
      either,
      E.fold(
        (error) => this.serverError(`Error: ${error.message}`, error),
        okResponse,
      ),
    ));
  };
}

export const accounts = new ProfileLambda(userRepository, deviceRepository);
export const {
  profileHandler, putProfileHandler, revisionDateHandler,
} = accounts;
