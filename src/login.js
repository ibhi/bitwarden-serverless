import querystring from 'querystring';
import speakeasy from 'speakeasy';
import * as utils from './lib/api_utils';
import { User, Device, Twofactor } from './lib/models';
import { regenerateTokens, hashesMatch, DEFAULT_VALIDITY } from './lib/bitwarden';
import { TwoFactorType } from './two_factor';

export const handler = async (event, context, callback) => {
  console.log('Login handler triggered', JSON.stringify(event, null, 2));
  if (!event.body) {
    callback(null, utils.validationError('Missing request body'));
    return;
  }

  const body = utils.normalizeBody(querystring.parse(event.body));

  let eventHeaders;
  let device;
  let deviceType;
  let user;

  try {
    switch (body.grant_type) {
      case 'password':
        if ([
          'client_id',
          'grant_type',
          'password',
          'scope',
          'username',
        ].some((param) => {
          if (!body[param]) {
            callback(null, utils.validationError(param + ' must be supplied'));
            return true;
          }

          return false;
        })) {
          return;
        }

        if (body.scope !== 'api offline_access') {
          callback(null, utils.validationError('Scope not supported'));
          return;
        }

        [user] = (await User.scan()
          .where('email').equals(body.username.toLowerCase())
          .execAsync())
          .Items;

        if (!user) {
          callback(null, utils.validationError('Invalid username or password'));
          return;
        }

        if (!hashesMatch(user.get('passwordHash'), body.password)) {
          callback(null, utils.validationError('Invalid username or password'));
          return;
        }

        let twofactors = (await Twofactor.query(user.get('uuid')).execAsync()).Items;
        let enabled = true;

        if(twofactors && twofactors.length === 0) {
          enabled = false;
        }

        if(enabled) {
          let twofactorIds = twofactors.map(twofactor => twofactor.get('aType'));
          let selectedId = parseInt(body.twofactorprovider, 10) || twofactorIds[0]; // If we aren't given a two factor provider, assume the first one
          
          if(!body.twofactortoken) {
            callback(null, {
              statusCode: 400,
              headers: utils.CORS_HEADERS,
              body: JSON.stringify({
                error: 'invalid_grant',
                error_description: 'Two factor required.',
                TwoFactorProviders: twofactorIds,
                TwoFactorProviders2: { 0: null },
              }),
            });
            return;
          }

          let selectedTwofactor = twofactors
            .filter(twofactor => twofactor.get('aType') === selectedId && twofactor.get('enabled'))[0];
          let selectedData = selectedTwofactor.get('data');
          let remember = body.twofactoremember || 0;
          let verified = false;

          switch(selectedId) {
            case TwoFactorType.Authenticator:
              verified = speakeasy.totp.verify({
                secret: selectedData,
                encoding: 'base32',
                token: body.twofactortoken,
              });
              break;
                  // More two facto auth providers
          }

          if (!verified) {
            callback(null, {
              statusCode: 400,
              headers: utils.CORS_HEADERS,
              body: JSON.stringify({
                error: 'invalid_grant',
                error_description: 'Two factor required.',
                TwoFactorProviders: [0],
                TwoFactorProviders2: { 0: null },
              }),
            });
            return;
          }

        }

        // if (user.get('totpSecret')) {
        //   const verified = speakeasy.totp.verify({
        //     secret: user.get('totpSecret'),
        //     encoding: 'base32',
        //     token: body.twofactortoken,
        //   });

        //   if (!verified) {
        //     callback(null, {
        //       statusCode: 400,
        //       headers: utils.CORS_HEADERS,
        //       body: JSON.stringify({
        //         error: 'invalid_grant',
        //         error_description: 'Two factor required.',
        //         TwoFactorProviders: [0],
        //         TwoFactorProviders2: { 0: null },
        //       }),
        //     });
        //     return;
        //   }
        // }

        // Web vault doesn't send device identifier
        if (body.deviceidentifier) {
          device = await Device.getAsync(body.deviceidentifier);
          if (device && device.get('userUuid') !== user.get('uuid')) {
            await device.destroyAsync();
            device = null;
          }
        }

        if (!device) {
          device = await Device.createAsync({
            userUuid: user.get('uuid'),
            uuid: body.deviceidentifier,
          });
        }

        // Browser extension sends body, web and mobile send header.
        // iOS sends lower case header with string value.
        eventHeaders = utils.normalizeBody(event.headers);
        deviceType = body.devicetype;
        if (!Number.isNaN(eventHeaders['device-type'])) {
          deviceType = parseInt(event.headers['device-type'], 10);
        }

        if (body.devicename && deviceType) {
          device.set({
            // Browser extension sends body, web and mobile send header
            type: deviceType,
            name: body.devicename,
          });
        }

        if (body.devicepushtoken) {
          device.set({ pushToken: body.devicepushtoken });
        }

        break;
      case 'refresh_token':
        if (!body.refresh_token) {
          callback(null, utils.validationError('Refresh token must be supplied'));
          return;
        }

        console.log('Login attempt using refresh token', { refreshToken: body.refresh_token });

        [device] = (await Device.scan()
          .where('refreshToken').equals(body.refresh_token)
          .execAsync())
          .Items;

        if (!device) {
          console.error('Invalid refresh token', { refreshToken: body.refresh_token });
          callback(null, utils.validationError('Invalid refresh token'));
          return;
        }

        user = await User.getAsync(device.get('userUuid'));
        break;
      default:
        callback(null, utils.validationError('Unsupported grant type'));
        return;
    }

    const tokens = regenerateTokens(user, device);

    device.set({ refreshToken: tokens.refreshToken });

    device = await device.updateAsync();
    const privateKey = user.get('privateKey') || null;

    callback(null, utils.okResponse({
      access_token: tokens.accessToken,
      expires_in: DEFAULT_VALIDITY,
      token_type: 'Bearer',
      refresh_token: tokens.refreshToken,
      Key: user.get('key'),
      PrivateKey: privateKey ? privateKey.toString('utf8') : null,
    }));
  } catch (e) {
    callback(null, utils.serverError('Internal error', e));
  }
};
