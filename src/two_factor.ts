import { User } from './lib/models';
import { loadContextFromHeader, hashesMatch, regenerateTokens } from './lib/bitwarden';
import * as utils from './lib/api_utils';
import { AuthenticatorProvider } from './twofactor/providers/authenticator-provider';
import { decode } from 'hi-base32';
import { GetAuthenticatorResponse, TwoFactorType, TwoFactorTypeKey } from './twofactor/models';
import { GenericTwofactorProvider, genericTwofactorProvider } from './twofactor/generic-twofactor-provider';
import { Item, reset } from 'dynogels';
import * as u2f from 'u2f';
import { Twofactor, userRepository, UserRepository } from './db/user-repository';

const authenticatorProvider = new AuthenticatorProvider();

// Todo: make it configurable by the developer
const APP_ID = 'https://localhost:8080';
export const U2F_VERSION = 'U2F_V2';

// /two-factor GET
export const getHandler = async (event, context, callback) => {
  console.log('2FA get handler triggered', JSON.stringify(event, null, 2));

  let user;
  try {
    ({ user } = await loadContextFromHeader(event.headers.Authorization));
    console.log('User uuid ' + user.get('pk'));
  } catch (e) {
    callback(null, utils.validationError('User not found: ' + e.message));
    return;
  }

  try {
    const result = await genericTwofactorProvider.getAvailableTwofactors(user);
    callback(null, utils.okResponse(result));
    // {"ContinuationToken":null,"Data":[{"Enabled":true,"Object":"twoFactorProvider","Type":0},{"Enabled":true,"Object":"twoFactorProvider","Type":4}],"Object":"list"}
  } catch (e) {
    callback(null, utils.serverError('Internal error', e));
  }

}

interface DisableTwoFactorData {
  masterpasswordhash: string;
  type: string;
}

// /two-factor/disable POST | PUT
export const disableTwofactorHandler = async (event, context, callback) => {
  console.log('2FA disable handler triggered', JSON.stringify(event, null, 2));

  if (!event.body) {
    callback(null, utils.validationError('Missing request body'));
    return;
  }

  const body: DisableTwoFactorData = utils.normalizeBody(JSON.parse(event.body));

  let user;
  try {
    ({ user } = await loadContextFromHeader(event.headers.Authorization));
    console.log('User uuid ' + user.get('pk'));
  } catch (e) {
    callback(null, utils.validationError('User not found: ' + e.message));
    return;
  }

  if (!hashesMatch(user.get('passwordHash'), body.masterpasswordhash)) {
    callback(null, utils.validationError('Invalid username or password'));
    return;
  }

  const type: TwoFactorType = parseInt(body.type, 10);

  try {
    const twofactor = userRepository.getTwofactorByType(user, type);
    if(twofactor) {
      await userRepository.removeTwofactorByType(user.get('pk'), type);

      const result = {
        Enabled: false,
        Type: type,
        Object: "twoFactorProvider"
      };
      callback(null, utils.okResponse(result));
    } else {
      callback(null, utils.validationError('ERROR: Invalid twofactor to delete'));
    }
  } catch(e) {
    callback(null, utils.serverError('ERROR: Could not disable the twofactor, please try again', e));
  }

}

interface GetRecoveryCodeData {
  masterpasswordhash: string;
}

// /two-factor/get-recover POST
export const getRecoveryCode = async (event, context, callback) => {
  console.log('2FA get recovery code triggered', JSON.stringify(event, null, 2));

  if (!event.body) {
    callback(null, utils.validationError('Missing request body'));
    return;
  }

  const body: GetRecoveryCodeData = utils.normalizeBody(JSON.parse(event.body));

  let user;
  try {
    ({ user } = await loadContextFromHeader(event.headers.Authorization));
    console.log('User uuid ' + user.get('pk'));
  } catch (e) {
    callback(null, utils.validationError('User not found: ' + e.message));
    return;
  }

  if (!hashesMatch(user.get('passwordHash'), body.masterpasswordhash)) {
    callback(null, utils.validationError('Invalid username or password'));
    return;
  }

  const recoveryCode = user.get('recoveryCode');
  if(recoveryCode) {
    const result = {
      Code: recoveryCode,
      Object: 'twoFactorRecover'
    }
    callback(null, utils.okResponse(result));
    return;
  } else {
    callback(null, utils.validationError('ERROR: no recovery code available'));
    return;
  }

}

interface RecoverData {
  masterpasswordhash: string;
  email: string;
  recoverycode: string;
}

// /two-factor/recover POST
export const recover = async (event, context, callback) => {
  console.log('2FA get recovery code triggered', JSON.stringify(event, null, 2));

  if (!event.body) {
    callback(null, utils.validationError('Missing request body'));
    return;
  }

  const body: RecoverData = utils.normalizeBody(JSON.parse(event.body));

  let user: Item;
  try {
    // [user] = (await User.scan()
    //       .where('email').equals(body.email.toLowerCase())
    //       .execAsync())
    //       .Items;
    user = await userRepository.getUserByEmail(body.email);
    console.log('User uuid ' + user.get('pk'));
    if(!user) {
      throw new Error("Invalid email address");
    }
  } catch (e) {
    callback(null, utils.validationError('User not found: ' + e.message));
    return;
  }

  if (!hashesMatch(user.get('passwordHash'), body.masterpasswordhash)) {
    callback(null, utils.validationError('Invalid username or password'));
    return;
  }

  // Check if recovery code is correct
  if(user.get('recoveryCode').toLowerCase() !== body.recoverycode) {
    callback(null, utils.validationError('Recovery code is incorrect. Try again.'));
    return;
  }

  try {
    // Remove all twofactors from the user and the recovery code
    await userRepository.deleteAllTwofactors(user.get('pk'));

    callback(null, utils.okResponse({}));
    return;
  } catch (error) {
    callback(null, utils.serverError('Error: Unable to recover, please try again later', error));
  }
  
}

// Authenticator

// /two-factor/get-authenticator POST
export const getAuthenticatorHandler = async (event, context, callback) => {
  console.log('2FA get authenticator handler triggered', JSON.stringify(event, null, 2));

  if (!event.body) {
    callback(null, utils.validationError('Missing request body'));
    return;
  }

  const body: any = utils.normalizeBody(JSON.parse(event.body));

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

  try {
    // const twofactor = await authenticatorProvider.getTwofactor(user.get('uuid'));
    // const result = authenticatorProvider.getAuthenticatorResponse(twofactor);
    const result = authenticatorProvider.getTwofactor(user);

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

  const body: any = utils.normalizeBody(JSON.parse(event.body));

  let user;
  try {
    ({ user } = await loadContextFromHeader(event.headers.Authorization));
    console.log('User uuid ' + user.get('pk'));
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

  // Validate key as base32 and 20 bytes length
  try {
    const decodedKey = decode.asBytes(key)
    if(decodedKey.length != 32) {
      throw new Error("Invalid length of the key")
    }
  } catch(e) {
    callback(null, utils.validationError('Invalid key: ' + e));
    return;
  }

  try {
    const verified = authenticatorProvider.validate(user.get('pk'), token, key)
    
    if (verified) {

      // await genericTwofactorProvider.generateRecoverCode(user);

      const twofactor: Twofactor<string> = {
        typeKey: TwoFactorTypeKey.Authenticator,
        type: TwoFactorType.Authenticator,
        enabled: true,
        data: [key]
      };

      await userRepository.createTwofactor(user, twofactor);
      
      let result: GetAuthenticatorResponse = {
        Object: "twoFactorAuthenticator",
        Enabled: true,
        Key: key
      };

      callback(null, utils.okResponse(result));
      return;
    } else {
      callback(null, utils.serverError('ERROR, Could not verify supplied code, please try again.', 'Verification failed'));
    }
  } catch (e) {
    callback(null, utils.serverError('ERROR: Could not verify supplied code, please try again', e));
  }

}
interface GetU2fData {
  masterpasswordhash: string;
}

// U2F
// /two-factor/get-u2f POST
export const getU2f = async (event, context, callback) => {
  console.log('2FA get u2f handler triggered', JSON.stringify(event, null, 2));

  if (!event.body) {
    callback(null, utils.validationError('Missing request body'));
    return;
  }

  const body: GetU2fData = utils.normalizeBody(JSON.parse(event.body));

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

  // const [twofactor] = await genericTwofactorProvider.getTwofactorByType(user.get('uuid'), TwoFactorType.U2f);
  const twofactor = userRepository.getTwofactorByType(user, TwoFactorType.U2f);
// Todo: map the data in proper formar if it already exists
  const result = {
    Enabled: false,
    Keys: [],
    Object: "twoFactorU2f"
  }

  if(!twofactor) {
    callback(null, utils.okResponse(result));
    return;
  } else if(!twofactor.enabled && !twofactor.data) {
    callback(null, utils.okResponse(result));
    return;
  }
}

export interface ChallengeResponse {
  version: string;
  appId: string,
  challenge: string,
  keyHandle?: string
}

const createU2fChallenge = async (user: Item, type: TwoFactorType): Promise<ChallengeResponse> => {
  const challengeResponse: ChallengeResponse = u2f.request(APP_ID);
  const typeKey = UserRepository.twofactorKeyToTypeMap.get(type) || TwoFactorTypeKey.U2f;

  const twofactor: Twofactor<ChallengeResponse> = {
      typeKey: typeKey,
      type: type,
      enabled: true,
      data: [challengeResponse]
  };

  await userRepository.createTwofactor(user, twofactor);

  return challengeResponse;
}

// /two-factor/get-u2f-challenge POST
export const generateU2fChallenge = async (event, context, callback) => {
  console.log('2FA get u2f handler triggered', JSON.stringify(event, null, 2));

  if (!event.body) {
    callback(null, utils.validationError('Missing request body'));
    return;
  }

  const body: GetU2fData = utils.normalizeBody(JSON.parse(event.body));

  let user;
  try {
    ({ user } = await loadContextFromHeader(event.headers.Authorization));
    console.log('User uuid ' + user.get('pk'));
  } catch (e) {
    callback(null, utils.validationError('User not found: ' + e.message));
    return;
  }

  if (!hashesMatch(user.get('passwordHash'), body.masterpasswordhash)) {
    callback(null, utils.validationError('Invalid username or password'));
    return;
  }

  try {

    const challengeResponse: ChallengeResponse = await createU2fChallenge(user, TwoFactorType.U2fRegisterChallenge);

    const result = {
      UserId: user.get('pk'),
      AppId: APP_ID,
      Challenge: challengeResponse.challenge,
      Version: U2F_VERSION,
    };

    callback(null, utils.okResponse(result));
    return;
  } catch(error) {
    callback(null, utils.serverError('Error saving challenge', error));
    return;
  }

}

interface EnableU2FData {
  id: number | string;
  // 1..5
  name: string;
  masterpasswordhash: string;
  deviceresponse: string;
}

interface DeviceResponse {
  clientData: string;
  errorCode: number;
  registrationData: string;
  version: string;
}

// interface Challange {
//   appId: string;
//   challenge: string;
//   version: string
// }

interface RegistrationCheckResponse {
  successful: boolean;
  publicKey: string;
  keyHandle: string;
  certificate: string;
  errorMessage?: string;
}

export interface Registration {
  pubKey: string;
  keyHandle: string;
  attestationCert: string;
}

export interface U2FRegistration {
  id: string | number;
  name: string;
  reg: Registration;
  counter: number;
  compromised: boolean;
}

// const getU2fRegistrations = async(userUuid: string) => {
  
// }


// /two-factor/u2f POST
export const activateU2f = async (event, context, callback) => {
  console.log('2FA get u2f handler triggered', JSON.stringify(event, null, 2));

  if (!event.body) {
    callback(null, utils.validationError('Missing request body'));
    return;
  }

  const body: EnableU2FData = utils.normalizeBody(JSON.parse(event.body));

  let user;
  try {
    ({ user } = await loadContextFromHeader(event.headers.Authorization));
    console.log('User uuid ' + user.get('pk'));
  } catch (e) {
    callback(null, utils.validationError('User not found: ' + e.message));
    return;
  }

  if (!hashesMatch(user.get('passwordHash'), body.masterpasswordhash)) {
    callback(null, utils.validationError('Invalid username or password'));
    return;
  }

  let challenge: ChallengeResponse;

  try {
    // const [twofactor] = await genericTwofactorProvider.getTwofactorByType(user.get('uuid'), TwoFactorType.U2fRegisterChallenge);
    const twofactor: Twofactor<ChallengeResponse> = userRepository.getTwofactorByType(user, TwoFactorType.U2fRegisterChallenge);
    challenge = twofactor.data[0];
    // await twofactor.destroyAsync();
    await userRepository.removeTwofactorByType(user.get('pk'), TwoFactorType.U2fRegisterChallenge);
  } catch (error) {
    callback(null, utils.serverError('Error: Cant recover challenge', error));
    return;
  }
  console.log(`Device response before parsing ${body.deviceresponse}`)
  const deviceResponse: DeviceResponse = JSON.parse(body.deviceresponse);
  console.log(`Device response after parsing ${deviceResponse}`)
  if(deviceResponse.errorCode !== 0) {
    callback(null, utils.validationError("Error registering U2F token"));
    return;
  }

  try {
    const registration: RegistrationCheckResponse = u2f.checkRegistration(challenge, deviceResponse);
    console.log('Check registration response ' + JSON.stringify(registration));
    if(registration && registration.errorMessage) {
      throw Error('Verification of challange failed!');
    }

    if(registration.successful) {
      // Create new full registration (U2FRegsitration) object
      const reg: Registration = {
        pubKey: registration.publicKey,
        keyHandle: registration.keyHandle,
        attestationCert: registration.certificate
      };
      const fullRegistration: U2FRegistration = {
        id: body.id,
        name: body.name,
        reg: reg,
        compromised: false,
        counter: 0
      };
      // Get existing u2f twofactor record from DB
      // const [twofactor] = await genericTwofactorProvider.getTwofactorByType(user.get('uuid'), TwoFactorType.U2f);
      const twofactor: Twofactor<U2FRegistration> = userRepository.getTwofactorByType(user, TwoFactorType.U2f);

      // Parse the data field to array of U2FRegistration
      let regs: U2FRegistration[];
      if(twofactor && twofactor.data) {
        regs = twofactor.data;
      } else {
        regs = [];
      }
      // Push the new registration data to the existing array
      regs.push(fullRegistration);
      
      const newTwofactor: Twofactor<U2FRegistration> = {
        typeKey: TwoFactorTypeKey.U2f,
        type: TwoFactorType.U2f,
        enabled: true,
        data: regs,
      }
      
      await userRepository.createTwofactor(user, newTwofactor);

      const keys = regs.map(reg => ({
        Id: reg.id,
        Name: reg.name,
        Compromised: reg.compromised
      }));

      const result = {
        Enabled: true,
        Keys: keys,
        Object: "twoFactorU2f"
      }
      callback(null, utils.okResponse(result));
      return;
    }
    
  } catch (error) {
    callback(null, utils.validationError("Error validating U2F token"));
    return;
  }
}