import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as E from 'fp-ts/lib/Either';
import { pipe } from 'fp-ts/lib/pipeable';
import * as TE from 'fp-ts/lib/TaskEither';

import BaseLambda from '../../../libs/base-lambda';
import { deviceRepository } from '../../../libs/db/device-repository';
import { UserKdfInformation } from '../../../libs/db/user-kdf-information';
import { userRepository } from '../../../libs/db/user-repository';
import { PreloginRequestModel } from './prelogin-request-model';

export class PreloginLambda extends BaseLambda {
  public handler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
    console.log('Prelogin handler triggered', JSON.stringify(event, null, 2));

    const bodyEither: E.Either<APIGatewayProxyResult, PreloginRequestModel> = this
      .parseJsonRequestBody(event.body);

    const userKdfInformationTaskEither = pipe(
      bodyEither,
      TE.fromEither,
      TE.chain((body: PreloginRequestModel) => this.createTaskEitherFromPromise(
        this.userRepository.getKdfInformationByEmail(body.email),
      )),
    );

    return userKdfInformationTaskEither().then(
      (userKdfInformationEither: E.Either<APIGatewayProxyResult, UserKdfInformation>) => pipe(
        userKdfInformationEither,
        E.fold(
          (error: APIGatewayProxyResult) => error,
          (userKdfInformation: UserKdfInformation) => this.okResponse(userKdfInformation),
        ),
      ),
    );
  };
}

export const preloginLambda = new PreloginLambda(userRepository, deviceRepository);
export const { handler } = preloginLambda;
