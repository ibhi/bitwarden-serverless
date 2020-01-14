import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Item } from 'dynogels';
import { sequenceS } from 'fp-ts/lib/Apply';
import * as E from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/pipeable';
import * as TE from 'fp-ts/lib/TaskEither';

import BaseLambda from '../../../libs/base-lambda';
import { deviceRepository } from '../../../libs/db/device-repository';
import { userRepository } from '../../../libs/db/user-repository';
import { getRevisionDateAsMillis } from '../../../libs/lib/mappers';
import { ProfileResponseModel } from './profile-response-model';
import { UpdateProfileRequestModel } from './update-profile-request-model';

export class ProfileLambda extends BaseLambda {
  getHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
    console.log('Account profile handler triggered', JSON.stringify(event, null, 2));

    const userTaskEither: TE.TaskEither<APIGatewayProxyResult, Item> = pipe(
      event.headers.Authorization,
      this.loadContext,
      TE.map(({ user }) => user),
    );
    // Invoke TaskEither to get a promise of type Either<Error, T>
    // and fold over the either to get the values out of it
    return userTaskEither().then((either) => pipe(
      either,
      E.fold(
        (error) => error,
        (user) => this.okResponse(new ProfileResponseModel(user)),
      ),
    ));
  };

  putHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
    console.log('Update account profile handler triggered', JSON.stringify(event, null, 2));

    const userTaskEither: TE.TaskEither<APIGatewayProxyResult, Item> = pipe(
      event.headers.Authorization,
      this.loadContext,
      TE.map(({ user }) => user),
    );

    const bodyEither: E.Either<APIGatewayProxyResult, UpdateProfileRequestModel> = pipe(
      this.parseJsonRequestBody<UpdateProfileRequestModel>(event.body),
      // Parse JSON and assign it to the class instance
      E.map((body) => Object.assign(new UpdateProfileRequestModel(), body)),
    );

    const updateUserDocument = (
      userTE: TE.TaskEither<APIGatewayProxyResult, Item>,
      bodyE: E.Either<APIGatewayProxyResult, UpdateProfileRequestModel>,
    ): TE.TaskEither<APIGatewayProxyResult, Item> => pipe(
      {
        user: userTE,
        body: TE.fromEither(bodyE),
      },
      sequenceS(TE.taskEither),
      TE.map(({ user, body }) => body.toUser(user)),
      TE.chain((user) => this.createTaskEitherFromPromise(user.updateAsync())),
    );

    return updateUserDocument(userTaskEither, bodyEither)()
      .then((userEither: E.Either<APIGatewayProxyResult, Item>) => pipe(
        userEither,
        E.fold(
          (error) => error,
          (user) => this.okResponse(new ProfileResponseModel(user)),
        ),
      ));
  };

  revisionDateHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
    console.log('Account revision date handler triggered', JSON.stringify(event, null, 2));

    const getUser: TE.TaskEither<APIGatewayProxyResult, Item> = pipe(
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
        (error) => error,
        okResponse,
      ),
    ));
  };
}

export const accounts = new ProfileLambda(userRepository, deviceRepository);
export const {
  getHandler: profileHandler, putHandler: putProfileHandler, revisionDateHandler,
} = accounts;