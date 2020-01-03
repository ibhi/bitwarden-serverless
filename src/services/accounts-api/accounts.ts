import { Item } from 'dynogels';
import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { getRevisionDateAsMillis, mapUser } from '../../libs/lib/mappers';
import BaseLambda from '../../libs/base-lambda';
import { userRepository } from '../../libs/db/user-repository';
import { deviceRepository } from '../../libs/db/device-repository';

export class AccountsLambda extends BaseLambda {
  profileHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
    console.log('Account profile handler triggered', JSON.stringify(event, null, 2));

    let user: Item;
    try {
      ({ user } = await this.loadContextFromHeader(event.headers.Authorization));
    } catch (e) {
      return this.validationError(`User not found: ${e.message}`);
    }

    try {
      return this.okResponse(mapUser(user));
    } catch (e) {
      return this.serverError('Error: ', e);
    }
  };

  putProfileHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
    console.log('Update account profile handler triggered', JSON.stringify(event, null, 2));

    let user;
    try {
      ({ user } = await this.loadContextFromHeader(event.headers.Authorization));
    } catch (e) {
      return this.validationError(`User not found: ${e.message}`);
    }
    let body;
    if (event.body !== null) {
      body = this.normalizeBody(JSON.parse(event.body));
    }

    [['masterpasswordhint', 'passwordHint'], ['name', 'name'], ['culture', 'culture']].forEach(([requestAttr, attr]) => {
      if (body[requestAttr]) {
        user.set({ [attr]: body[requestAttr] });
      }
    });

    try {
      user = await user.updateAsync();
      return this.okResponse(mapUser(user));
    } catch (e) {
      return this.serverError('Error: ', e);
    }
  };

  revisionDateHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
    console.log('Account revision date handler triggered', JSON.stringify(event, null, 2));

    let user;
    try {
      ({ user } = await this.loadContextFromHeader(event.headers.Authorization));
    } catch (e) {
      return this.validationError(`User not found: ${e.message}`);
    }

    try {
      return {
        statusCode: 200,
        headers: Object.assign(BaseLambda.CORS_HEADERS, {
          'Content-Type': 'text/plain',
        }),
        body: String(getRevisionDateAsMillis(user)),
      };
    } catch (e) {
      return this.serverError('Error: ', e);
    }
  };
}

export const accounts = new AccountsLambda(userRepository, deviceRepository);
export const { profileHandler, putProfileHandler, revisionDateHandler } = accounts;
