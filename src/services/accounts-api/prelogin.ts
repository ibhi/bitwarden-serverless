import { KDF_PBKDF2, KDF_PBKDF2_ITERATIONS_DEFAULT } from '../../libs/lib/crypto';
import * as utils from '../../libs/lib/api_utils';
import { userRepository } from '../../libs/db/user-repository';

export const handler = async (event, context, callback) => {
  console.log('Prelogin handler triggered', JSON.stringify(event, null, 2));

  if (!event.body) {
    callback(null, utils.validationError('Request body is missing'));
    return;
  }

  const body = utils.normalizeBody(JSON.parse(event.body));

  // const [user] = (await User.scan()
  //   .where('email').equals(body.email.toLowerCase())
  //   .execAsync())
  //   .Items;
  const user = await userRepository.getUserByEmail(body.email);

  if (!user) {
    callback(null, utils.validationError('Unknown username'));
    return;
  }

  callback(null, utils.okResponse({
    Kdf: user.get('kdfType') || KDF_PBKDF2,
    KdfIterations: user.get('kdfIterations') || KDF_PBKDF2_ITERATIONS_DEFAULT,
  }));
};
