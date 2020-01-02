// Todo: fix the linting issues, need refactoring
import querystring from 'querystring';
import { Item } from 'dynogels';
import crypto from 'crypto';
import * as utils from '../../libs/lib/api_utils';
import { regenerateTokens, hashesMatch, DEFAULT_VALIDITY } from '../../libs/lib/bitwarden';
import { TwoFactorType, Twofactor } from '../twofactor-api/models';
import { userRepository, UserRepository } from '../../libs/db/user-repository';
import { deviceRepository } from '../../libs/db/device-repository';
import { authenticatorProvider } from '../twofactor-api/providers/authenticator-provider';
import { u2fProvider } from '../twofactor-api/providers/u2f-provider';
import { genericTwofactorProvider, TwofactorData } from '../twofactor-api/providers/generic-twofactor-provider';

const getRegisteredTwofactorProvidersForUser = async (
  twofacorTypes: TwoFactorType[],
  user: Item,
): Promise<{ [key: string]: null | string }> => {
  const twofactorToResultMap = {
    [TwoFactorType.Authenticator]: async (): Promise<null> => null,
    [TwoFactorType.U2f]: async (): Promise<{ Challenges: string }> => (
      { Challenges: JSON.stringify(await u2fProvider.createU2fLoginChallenges(user)) }
    ),
  };

  return twofacorTypes.reduce(async (twofactorProvidersPromise, twofactorType) => {
    const twofactorProviders = await twofactorProvidersPromise;
    twofactorProviders[twofactorType] = await twofactorToResultMap[twofactorType]();
    return twofactorProviders;
  },
  // Because the callback is marked async, we cannot give a initial value as simple empty object,
  // rather it has to be a promise of empty object. And inside the callback we await the promise
  // to get the actual value
  Promise.resolve({}));
};

type ValidateParams = {
  isMissingParams: boolean;
  missingParams: string[];
};

const validateBodyParams = (body): ValidateParams => {
  const missingParams = [
    'client_id',
    'grant_type',
    'password',
    'scope',
    'username',
  ].filter((param) => (!body[param]));

  const isMissingParams = missingParams.length > 0;

  return {
    isMissingParams,
    missingParams,
  };
};

const generateTokens = async (
  user: Item,
  device: Item,
  twofactorRememberToken,
): Promise<utils.LambdaHttpResponse> => {
  const tokens = regenerateTokens(user, device);

  device.set({ refreshToken: tokens.refreshToken });

  await device.updateAsync();
  const privateKey = user.get('privateKey') || null;

  return utils.okResponse({
    access_token: tokens.accessToken,
    expires_in: DEFAULT_VALIDITY,
    token_type: 'Bearer',
    refresh_token: tokens.refreshToken,
    Key: user.get('key'),
    PrivateKey: privateKey ? privateKey.toString('utf8') : null,
    TwoFactorToken: twofactorRememberToken || null,
  });
};

const loginWithPassword = async (body, eventHeaders): Promise<utils.LambdaHttpResponse> => {
  let device;
  let deviceType;
  let twofactorRememberToken;

  const { isMissingParams, missingParams } = validateBodyParams(body);

  if (isMissingParams) {
    return utils.validationError(`${missingParams.join(',')} must be supplied`);
  }

  if (body.scope !== 'api offline_access') {
    return utils.validationError('Scope not supported');
  }

  const user = await userRepository.getUserByEmail(body.username);

  if (!user) {
    return utils.validationError('Invalid username or password');
  }

  if (!hashesMatch(user.get('passwordHash'), body.password)) {
    return utils.validationError('Invalid username or password');
  }

  const userUuid = user.get(UserRepository.PARTITION_KEY);

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

  const twofactors: Twofactor<TwofactorData>[] = genericTwofactorProvider
    .getAvailableTwofactors(user);
  let enabled = true;

  if (twofactors.length === 0) {
    enabled = false;
  }

  if (enabled) {
    let remember = parseInt(body.twofactorremember, 10) || 0;

    const twofactorIds: TwoFactorType[] = twofactors
      .map((twofactor) => twofactor.type).sort();
    // If we aren't given a two factor provider, assume the first one
    const selectedId: TwoFactorType = parseInt(body.twofactorprovider, 10) || twofactorIds[0];

    if (!body.twofactortoken) {
      return {
        statusCode: 400,
        headers: utils.CORS_HEADERS,
        body: JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Two factor required.',
          TwoFactorProviders: twofactorIds,
          TwoFactorProviders2: await getRegisteredTwofactorProvidersForUser(
            twofactorIds, user,
          ),
        }),
      };
    }

    const selectedTwofactor: Twofactor<TwofactorData> = twofactors
      .filter((twofactor) => twofactor.type === selectedId && twofactor.enabled)[0];
    const selectedData = selectedTwofactor && selectedTwofactor.data;
    let verified = false;

    switch (selectedId) {
      case TwoFactorType.Authenticator:
        verified = authenticatorProvider
          .validate(body.twofactortoken, selectedData[0] as string);
        break;
      case TwoFactorType.U2f:
        verified = await u2fProvider.validate(user, body.twofactortoken);
        break;
      case TwoFactorType.Remember:
        if (body.twofactortoken === device.get('twofactorRemember')) {
          // Set remember to 1 again here, otherwise it will remember only the first time
          remember = 1;
          verified = true;
        }
        break;
      default:
        return utils.validationError('Unsupported twofactor type');
      // Todo: More two facto auth providers
    }

    if (!verified) {
      return {
        statusCode: 400,
        headers: utils.CORS_HEADERS,
        body: JSON.stringify({
          error: 'invalid_grant',
          error_description: 'Two factor required.',
          TwoFactorProviders: [0],
          TwoFactorProviders2: { 0: null },
        }),
      };
    }

    if (remember === 1) {
      twofactorRememberToken = crypto.randomBytes(180).toString('base64');
      device.set({
        twofactorRemember: twofactorRememberToken,
      });
    } else {
      device.set({
        twofactorRemember: null,
      });
    }
  }

  // Browser extension sends body, web and mobile send header.
  // iOS sends lower case header with string value.
  deviceType = body.devicetype;
  if (!Number.isNaN(eventHeaders['device-type'])) {
    deviceType = parseInt(eventHeaders['device-type'], 10);
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

  return generateTokens(user, device, twofactorRememberToken);
};

const loginWithRefreshToken = async (body): Promise<utils.LambdaHttpResponse> => {
  if (!body.refresh_token) {
    return utils.validationError('Refresh token must be supplied');
  }

  console.log('Login attempt using refresh token', { refreshToken: body.refresh_token });

  const device = await deviceRepository.getDeviceByRefreshToken(body.refresh_token);

  if (!device) {
    console.error('Invalid refresh token', { refreshToken: body.refresh_token });
    return utils.validationError('Invalid refresh token');
  }

  const user = await userRepository.getUserById(device.get('pk'));

  return generateTokens(user, device, null);
};

export const handler = async (event): Promise<utils.LambdaHttpResponse> => {
  console.log('Login handler triggered', JSON.stringify(event, null, 2));
  if (!event.body) {
    return utils.validationError('Missing request body');
  }

  const body = utils.normalizeBody(querystring.parse(event.body));
  console.log(`Body ${JSON.stringify(body)}`);
  const eventHeaders = utils.normalizeBody(event.headers);

  try {
    switch (body.grant_type) {
      case 'password':
        return await loginWithPassword(body, eventHeaders);
      // break;
      case 'refresh_token':
        return await loginWithRefreshToken(body);
      default:
        return utils.validationError('Unsupported grant type');
    }
  } catch (e) {
    return utils.serverError('Internal error', e);
  }
};
