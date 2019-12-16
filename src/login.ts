import querystring from 'querystring';
import speakeasy from 'speakeasy';
import * as utils from './lib/api_utils';
import { regenerateTokens, hashesMatch, DEFAULT_VALIDITY } from './lib/bitwarden';
import { TwoFactorType, TwoFactorTypeKey } from './twofactor/models';
import { userRepository, Twofactor } from './db/user-repository';
import { deviceRepository } from './db/device-repository';
import { Item } from 'dynogels';
import { Registration, U2FRegistration, ChallengeResponse } from './two_factor';
import { User } from './lib/models';
import * as u2f from 'u2f';

const APP_ID = 'https://localhost:8080';

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
  let user: Item;

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

        const twofactors: Map<TwoFactorTypeKey, Twofactor<any>> = user.get('twofactors');

        let enabled = true;

        if(Object.keys(twofactors).length === 0) {
          enabled = false;
        }

        if(enabled) {
          const twofactorsList: Twofactor<any>[] = Object.keys(twofactors).map(key => twofactors[key]);
          const twofactorIds: TwoFactorType[] = twofactorsList.map(twofactor => twofactor.type).sort();

          const selectedId = parseInt(body.twofactorprovider, 10) || twofactorIds[0]; // If we aren't given a two factor provider, assume the first one
          
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

          const selectedTwofactor: Twofactor<any> = twofactorsList
            .filter(twofactor => twofactor.type === selectedId && twofactor.enabled)[0];
          const selectedData = selectedTwofactor.data;
          const remember = body.twofactoremember || 0;
          let verified = false;

          switch(selectedId) {
            case TwoFactorType.Authenticator:
              verified = speakeasy.totp.verify({
                secret: selectedData[0],
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
    }));
  } catch (e) {
    callback(null, utils.serverError('Internal error', e));
  }
};

const getU2fRegistrations = (user: Item): Registration[] => {
  const twofactor: Twofactor<U2FRegistration> = userRepository.getTwofactorByType(user, TwoFactorType.U2f);
  return twofactor.data.map(d => d.reg)
}

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
        const challenges = await createU2fLoginChallenges(user)
        twofactorProviders2[twoFactorType] = { Challenges: JSON.stringify(challenges)};
        console.log('Login challenges ' + JSON.stringify(challenges));
        break;
    }
  }
  
  return twofactorProviders2;
}

const createU2fLoginChallenges = async (user: Item): Promise<ChallengeResponse[]> => {
  const data = getU2fRegistrations(user)
    .map(registration => u2f.request(APP_ID, registration.keyHandle) as ChallengeResponse);
  
  const twofactor: Twofactor<ChallengeResponse> = {
    type: TwoFactorType.U2fLoginChallenge,
    typeKey: TwoFactorTypeKey.U2fLoginChallenge,
    enabled: true,
    data: data
  };

  await userRepository.createTwofactor(user, twofactor);
  return data;
};
