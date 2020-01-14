import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Item } from 'dynogels';
import { sequenceS } from 'fp-ts/lib/Apply';
import * as E from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/pipeable';
import * as TE from 'fp-ts/lib/TaskEither';

import BaseLambda from '../../../libs/base-lambda';
import { deviceRepository } from '../../../libs/db/device-repository';
import { userRepository } from '../../../libs/db/user-repository';
import { KeysRequestModel } from './keys-request-model';
import { KeysResponseModel } from './keys-response-model';

export class KeysLambda extends BaseLambda {
  handler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
    console.log('Keys handler triggered', JSON.stringify(event, null, 2));

    const bodyEither: E.Either<APIGatewayProxyResult, KeysRequestModel> = pipe(
      event.headers['content-type'].split(';')[0],
      E.fromNullable(this.validationError('Missing Content-Type header!')),
      E.chain(
        (contentType: string) => (contentType === 'application/json'
          ? this.parseJsonRequestBody<KeysRequestModel>(event.body)
          : this.parseQueryStringRequestBody<KeysRequestModel>(event.body)),
      ),
      E.map((body) => new KeysRequestModel(body)),
      E.chain((body: KeysRequestModel) => {
        const re = /^2\..+\|.+/;
        return re.test(body.encryptedprivatekey)
          ? E.right(body)
          : E.left(this.validationError('Invalid key'));
      }),
    );

    const userTaskEither: TE.TaskEither<APIGatewayProxyResult, Item> = pipe(
      event.headers.Authorization,
      this.loadContext,
      TE.map(({ user }) => user),
    );

    return pipe(
      {
        user: userTaskEither,
        body: TE.fromEither(bodyEither),
      },
      sequenceS(TE.taskEitherSeq),
      TE.map(({ body, user }) => body.toUser(user)),
      TE.chain((user: Item) => this.createTaskEitherFromPromise(user.updateAsync())),
      TE.map((user: Item) => new KeysResponseModel(user)),
      TE.map(this.okResponse),
    )().then((either) => pipe(
      either,
      E.fold(
        (errorResponse) => errorResponse,
        (successResponse) => successResponse,
      ),
    ));
  };
}

export const keysLambda = new KeysLambda(userRepository, deviceRepository);
export const { handler } = keysLambda;
