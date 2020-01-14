import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import * as utils from '../../../libs/lib/api_utils';
import { userRepository } from '../../../libs/db/user-repository';
import BaseLambda from '../../../libs/base-lambda';
import { deviceRepository } from '../../../libs/db/device-repository';

interface RequestBody {
  masterpasswordhash: string;
  email: string;
  key: string;
}

export class RegisterLambda extends BaseLambda {
  handler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
    console.log('Registration handler triggered', JSON.stringify(event, null, 2));

    if (process.env.DISABLE_USER_REGISTRATION === 'true') {
      return this.validationError('Signups are not permitted');
    }

    if (!event.body) {
      return this.validationError('Missing request body');
    }

    const body: RequestBody = utils.normalizeBody(JSON.parse(event.body));

    if (!body.masterpasswordhash) {
      return this.validationError('masterPasswordHash cannot be blank');
    }

    if (!/^.+@.+\..+$/.test(body.email)) {
      return this.validationError('supply a valid e-mail');
    }

    if (!/^\d\..+\|.+/.test(body.key)) {
      return this.validationError('supply a valid key');
    }

    try {
      const existingUser = await userRepository.getUserByEmail(body.email);

      if (existingUser) {
        return this.validationError('E-mail already taken');
      }

      await userRepository.createUser(userRepository.mapToUser(body));

      return this.okResponse('');
    } catch (e) {
      return this.serverError(e.message, e);
    }
  };
}

export const registerLambda = new RegisterLambda(userRepository, deviceRepository);
export const { handler } = registerLambda;
