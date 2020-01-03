import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { KDF_PBKDF2, KDF_PBKDF2_ITERATIONS_DEFAULT } from '../../libs/lib/crypto';
import { userRepository } from '../../libs/db/user-repository';
import BaseLambda from '../../libs/base-lambda';
import { deviceRepository } from '../../libs/db/device-repository';


interface RequestBody {
  email: string;
}

export class PreloginLambda extends BaseLambda {
  public handler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
    console.log('Prelogin handler triggered', JSON.stringify(event, null, 2));

    if (!event.body) {
      return this.validationError('Request body is missing');
    }

    const body: RequestBody = this.normalizeBody(JSON.parse(event.body));

    const user = await this.userRepository.getUserByEmail(body.email);

    if (!user) {
      return this.validationError('Unknown username');
    }

    return this.okResponse({
      Kdf: user.get('kdfType') || KDF_PBKDF2,
      KdfIterations: user.get('kdfIterations') || KDF_PBKDF2_ITERATIONS_DEFAULT,
    });
  };
}

export const prelogin = new PreloginLambda(userRepository, deviceRepository);
export const { handler } = prelogin;
