import * as utils from './lib/api_utils';
import { loadContextFromHeader } from './lib/bitwarden';
import { getRevisionDateAsMillis, mapUser } from './lib/mappers';
import { Item } from 'dynogels';

export const profileHandler = async (event, context, callback) => {
  console.log('Account profile handler triggered', JSON.stringify(event, null, 2));

  let user: Item;
  try {
    ({ user } = await loadContextFromHeader(event.headers.Authorization));
  } catch (e) {
    callback(null, utils.validationError('User not found: ' + e.message));
    return;
  }

  try {
    callback(null, utils.okResponse(mapUser(user)));
  } catch (e) {
    callback(null, utils.serverError('Error: ', e));
  }
};

export const putProfileHandler = async (event, context, callback) => {
  console.log('Update account profile handler triggered', JSON.stringify(event, null, 2));

  let user;
  try {
    ({ user } = await loadContextFromHeader(event.headers.Authorization));
  } catch (e) {
    callback(null, utils.validationError('User not found: ' + e.message));
  }

  const body = utils.normalizeBody(JSON.parse(event.body));

  [['masterpasswordhint', 'passwordHint'], ['name', 'name'], ['culture', 'culture']].forEach(([requestAttr, attr]) => {
    if (body[requestAttr]) {
      user.set({ [attr]: body[requestAttr] });
    }
  });

  try {
    user = await user.updateAsync();

    callback(null, utils.okResponse(mapUser(user)));
  } catch (e) {
    callback(null, utils.serverError('Error: ', e));
  }
};

export const revisionDateHandler = async (event, context, callback) => {
  console.log('Account revision date handler triggered', JSON.stringify(event, null, 2));

  let user;
  try {
    ({ user } = await loadContextFromHeader(event.headers.Authorization));
  } catch (e) {
    callback(null, utils.validationError('User not found: ' + e.message));
  }

  try {
    callback(null, {
      statusCode: 200,
      headers: Object.assign(utils.CORS_HEADERS, {
        'Content-Type': 'text/plain',
      }),
      body: getRevisionDateAsMillis(user),
    });
  } catch (e) {
    callback(null, utils.serverError('Error: ', e));
  }
};
