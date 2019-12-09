import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import { User, Twofactor } from './lib/models';
import { loadContextFromHeader, hashesMatch } from './lib/bitwarden';
import * as utils from './lib/api_utils';

export const TwoFactorType = {
  Authenticator: 0,
  Email: 1,
  Duo: 2,
  YubiKey: 3,
  U2f: 4,
  Remember: 5,
  OrganizationDuo: 6,
};

export const setupHandler = async (event, context, callback) => {
  console.log('2FA setup handler triggered', JSON.stringify(event, null, 2));

  if (!event.email) {
    callback(null, 'E-mail must be supplied');
    return;
  }

  let user;
  try {
    [user] = (await User.scan()
      .where('email').equals(event.email.toLowerCase())
      .execAsync()).Items;
  } catch (e) {
    callback(null, 'User not found');
    return;
  }

  try {
    const secret = speakeasy.generateSecret();

    user.set({ totpSecretTemp: secret.base32 });
    await user.updateAsync();

    const code = await qrcode.toDataURL(secret.otpauth_url);

    callback(null, code);
  } catch (e) {
    callback(null, 'ERROR: ' + e);
  }
};

export const completeHandler = async (event, context, callback) => {
  console.log('2FA complete handler triggered', JSON.stringify(event, null, 2));

  if (!event.email) {
    callback(null, 'E-mail must be supplied');
    return;
  }

  if (!event.code) {
    callback(null, 'Verification code must be supplied');
    return;
  }

  let user;
  try {
    [user] = (await User.scan()
      .where('email').equals(event.email.toLowerCase())
      .execAsync()).Items;
  } catch (e) {
    callback(null, 'User not found');
    return;
  }

  try {
    const verified = speakeasy.totp.verify({
      secret: user.get('totpSecretTemp'),
      encoding: 'base32',
      token: event.code,
    });

    if (verified) {
      user.set({
        totpSecretTemp: null,
        totpSecret: user.get('totpSecretTemp'),
        securityStamp: undefined,
      });

      await user.updateAsync();

      callback(null, 'OK, 2FA setup.');
    } else {
      callback(null, 'ERROR, Could not verify supplied code, please try again.');
    }
  } catch (e) {
    callback(null, 'ERROR: ' + e);
  }
};

// /two-factor GET
export const getHandler = async (event, context, callback) => {
  console.log('2FA get handler triggered', JSON.stringify(event, null, 2));

  let user;
  try {
    ({ user } = await loadContextFromHeader(event.headers.Authorization));
    console.log('User uuid ' + user.get('uuid'));
  } catch (e) {
    callback(null, utils.validationError('User not found: ' + e.message));
    return;
  }

  let twofactors;

  try {
    twofactors = (await Twofactor.scan()
      .where('userUuid').equals(user.get('uuid'))
      .execAsync()).Items;

      let data = twofactors.map(twofactor => {
        return {
          Enabled: twofactor.get('enabled'),
          Object: "twoFactorProvider",
          Type: twofactor.get('aType')
        }
      });

      let result = {
        ContinuationToken: null,
        Data: data,
        Object: "list"
      }

      callback(null, utils.okResponse(result));
      // {"ContinuationToken":null,"Data":[{"Enabled":true,"Object":"twoFactorProvider","Type":0},{"Enabled":true,"Object":"twoFactorProvider","Type":4}],"Object":"list"}
  } catch (e) {
    callback(null, utils.serverError('Internal error', e));
  }

}

// /two-factor/get-authenticator POST
export const getAuthenticatorHandler = async (event, context, callback) => {
  console.log('2FA get authenticator handler triggered', JSON.stringify(event, null, 2));

  if (!event.body) {
    callback(null, utils.validationError('Missing request body'));
    return;
  }

  const body = utils.normalizeBody(JSON.parse(event.body));

  let user;
  try {
    ({ user } = await loadContextFromHeader(event.headers.Authorization));
    console.log('User uuid ' + user.get('uuid'));
  } catch (e) {
    callback(null, utils.validationError('User not found: ' + e.message));
    return;
  }

  if (!hashesMatch(user.get('passwordHash'), body.masterpasswordhash)) {
    callback(null, utils.validationError('Invalid username or password'));
    return;
  }

  let twofactor;
  try {
    [twofactor] = (await Twofactor
      .scan()
      .where('userUuid').equals(user.get('uuid'))
      .where('aType').equals(TwoFactorType.Authenticator)
      .execAsync()).Items

      let key, enabled;

      if(twofactor && twofactor.get('enabled')) {
        key = twofactor.get('data');
        enabled = true
      } else {
        key = speakeasy.generateSecret().base32;
        enabled = false;
      }

    let result = {
      Object: "twoFactorAuthenticator",
      Enabled: enabled,
      Key: key
    };

    callback(null, utils.okResponse(result));

  } catch(e) {
    callback(null, utils.serverError('Internal error', e));
  }
}

// /two-factor/authenticator POST
export const activateAuthenticatorHandler = async (event, context, callback) => {
  console.log('2FA get authenticator handler triggered', JSON.stringify(event, null, 2));

  if (!event.body) {
    callback(null, utils.validationError('Missing request body'));
    return;
  }

  const body = utils.normalizeBody(JSON.parse(event.body));

  let user;
  try {
    ({ user } = await loadContextFromHeader(event.headers.Authorization));
    console.log('User uuid ' + user.get('uuid'));
  } catch (e) {
    callback(null, utils.validationError('User not found: ' + e.message));
    return;
  }

  if (!hashesMatch(user.get('passwordHash'), body.masterpasswordhash)) {
    callback(null, utils.validationError('Invalid username or password'));
    return;
  }

  let key = body.key;
  let token = body.token;

  if(!key && !token) {
    callback(null, utils.validationError('Missing key or token'));
    return;
  }

  try {
    const verified = speakeasy.totp.verify({
      secret: key,
      encoding: 'base32',
      token: token,
    });

    if (verified) {

      const twofactor = await Twofactor.createAsync({
        userUuid: user.get('uuid'),
        aType: TwoFactorType.Authenticator,
        enabled: true,
        data: key,
      });
      
      let result = {
        Object: "twoFactorAuthenticator",
        Enabled: true,
        Key: key
      };

      callback(null, utils.okResponse(result));
    } else {
      callback(null, utils.serverError('ERROR, Could not verify supplied code, please try again.'));
    }
  } catch (e) {
    callback(null, utils.serverError('ERROR: ' + e));
  }

}