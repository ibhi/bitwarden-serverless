import querystring from 'querystring';
import * as utils from '../../libs/lib/api_utils';
import { regenerateTokens, hashesMatch, DEFAULT_VALIDITY } from '../../libs/lib/bitwarden';
import { TwoFactorType, TwoFactorTypeKey, Twofactor } from '../twofactor-api/models';
import { userRepository, UserRepository } from '../../libs/db/user-repository';
import { deviceRepository, DeviceRepository } from '../../libs/db/device-repository';
import { Item } from 'dynogels';
import { authenticatorProvider } from '../twofactor-api/providers/authenticator-provider';
import { u2fProvider } from '../twofactor-api/providers/u2f-provider';
import { genericTwofactorProvider } from '../twofactor-api/providers/generic-twofactor-provider';
import crypto from 'crypto';

export const handler = async (event, context, callback) => {
  console.log('Login handler triggered', JSON.stringify(event, null, 2));
  if (!event.body) {
    callback(null, utils.validationError('Missing request body'));
    return;
  }

  const body = utils.normalizeBody(querystring.parse(event.body));

  console.log('Body ' + JSON.stringify(body));

  let eventHeaders;
  let device;
  let deviceType;
  let user: Item;
  let twofactorRememberToken;

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

        user = await userRepository.getUserByEmail(body.username);

        if (!user) {
          callback(null, utils.validationError('Invalid username or password'));
          return;
        }

        if (!hashesMatch(user.get('passwordHash'), body.password)) {
          callback(null, utils.validationError('Invalid username or password'));
          return;
        }

        const userUuid = user.get('pk');

        // Web vault doesn't send device identifier
        if (body.deviceidentifier) {
          // Device prefix will be added inside the device-repository
          device = await deviceRepository.getDeviceById(userUuid, body.deviceidentifier);
          if (device && device.get('pk') !== user.get('pk')) {
            await device.destroyAsync();
            device = null;
          }
        }
        
        if (!device) {
          device = await deviceRepository.createDevice(userUuid, body.deviceidentifier);
        }

        const twofactors: Twofactor<any>[] = genericTwofactorProvider.getAvailableTwofactors(user);
        let enabled = true;

        if(twofactors.length === 0) {
          enabled = false;
        }

        if(enabled) {
          let remember = parseInt(body.twofactorremember, 10) || 0;
          
          // const twofactorsList: Twofactor<any>[] = Object.keys(twofactors).map(key => twofactors[key]);
          const twofactorIds: TwoFactorType[] = twofactors.map(twofactor => twofactor.type).sort();

          const selectedId: TwoFactorType = parseInt(body.twofactorprovider, 10) || twofactorIds[0]; // If we aren't given a two factor provider, assume the first one
          
          if(!body.twofactortoken) {

            callback(null, {
              statusCode: 400,
              headers: utils.CORS_HEADERS,
              body: JSON.stringify({
                error: 'invalid_grant',
                error_description: 'Two factor required.',
                TwoFactorProviders: twofactorIds,
                TwoFactorProviders2: await getTwofactorProviders(twofactorIds, user),
              }),
            });
            return;
          }

          const selectedTwofactor: Twofactor<any> = twofactors
            .filter(twofactor => twofactor.type === selectedId && twofactor.enabled)[0];
          const selectedData = selectedTwofactor && selectedTwofactor.data;
          let verified = false;

          switch(selectedId) {
            case TwoFactorType.Authenticator:
              verified = authenticatorProvider.validate(body.twofactortoken, selectedData[0]);
              break;
            case TwoFactorType.U2f:
              verified = await u2fProvider.validate(user, body.twofactortoken);
              break;
            case TwoFactorType.Remember:
              if(body.twofactortoken === device.get('twofactorRemember')) {
                // Set remember to 1 again here, otherwise it will remember only the first time
                remember = 1;
                verified = true;
              }
              break;
            //Todo: More two facto auth providers
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

          if(remember === 1) {
            twofactorRememberToken = crypto.randomBytes(180).toString('base64');
            device.set({
              twofactorRemember: twofactorRememberToken
            });
          } else {
            device.set({
              twofactorRemember: null
            });
          }

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

        device = await deviceRepository.getDeviceByRefreshToken(body.refresh_token);

        if (!device) {
          console.error('Invalid refresh token', { refreshToken: body.refresh_token });
          callback(null, utils.validationError('Invalid refresh token'));
          return;
        }

        user = await userRepository.getUserById(device.get('pk'));
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
      TwoFactorToken: twofactorRememberToken || null
    }));
  } catch (e) {
    callback(null, utils.serverError('Internal error', e));
  }
};



const getTwofactorProviders = async (twofacorTypes: TwoFactorType[], user: Item) => {
  const twofactorProviders2: any = {};

  for(let twoFactorType of twofacorTypes) {
    switch(twoFactorType) {
      case TwoFactorType.Authenticator:
        twofactorProviders2[twoFactorType] = null;
        break;
        // Check for domain/appId set
      case TwoFactorType.U2f:
        console.log('Inside u2f case');
        const challenges = await u2fProvider.createU2fLoginChallenges(user)
        twofactorProviders2[twoFactorType] = { Challenges: JSON.stringify(challenges)};
        console.log('Login challenges ' + JSON.stringify(challenges));
        break;
    }
  }
  
  return twofactorProviders2;
}


