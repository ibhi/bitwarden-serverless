import querystring from 'querystring';
import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { regenerateTokens, loadContextFromHeader, DEFAULT_VALIDITY } from '../../libs/lib/bitwarden';
import BaseLambda from '../../libs/base-lambda';
import { userRepository } from '../../libs/db/user-repository';
import { deviceRepository } from '../../libs/db/device-repository';

export class KeysLambda extends BaseLambda {
  handler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
    console.log('Keys handler triggered', JSON.stringify(event, null, 2));
    if (!event.body) {
      return this.validationError('Missing request body');
    }

    let body;
    const contentType = event.headers['content-type'].split(';')[0];
    if (contentType === 'application/json') {
      body = this.normalizeBody(JSON.parse(event.body));
    } else {
      body = this.normalizeBody(querystring.parse(event.body));
    }

    let user;
    let device;
    try {
      ({ user, device } = await loadContextFromHeader(event.headers.Authorization));
    } catch (e) {
      return this.validationError(`User not found: ${e.message}`);
    }

    const re = /^2\..+\|.+/;
    if (!re.test(body.encryptedprivatekey)) {
      return this.validationError('Invalid key');
    }

    user.set({ privateKey: body.encryptedprivatekey });
    user.set({ publicKey: body.publickey });

    const tokens = regenerateTokens(user, device);

    device.set({ refreshToken: tokens.refreshToken });

    await device.updateAsync();
    await user.updateAsync();

    try {
      return this.okResponse({
        access_token: tokens.accessToken,
        expires_in: DEFAULT_VALIDITY,
        token_type: 'Bearer',
        refresh_token: tokens.refreshToken,
        Key: user.get('key'),
        Id: user.get('uuid'),
        Name: user.get('name'),
        Email: user.get('email'),
        EmailVerified: user.get('emailVerified'),
        Premium: user.get('premium'),
        MasterPasswordHint: user.get('passwordHint'),
        Culture: user.get('culture'),
        TwoFactorEnabled: user.get('totpSecret'),
        PrivateKey: user.get('privateKey'),
        SecurityStamp: user.get('securityStamp'),
        Organizations: '[]',
        Object: 'profile',
      });
    } catch (e) {
      return this.serverError('Internal error', e);
    }
  };
}

export const keysLambda = new KeysLambda(userRepository, deviceRepository);
export const { handler } = keysLambda;
