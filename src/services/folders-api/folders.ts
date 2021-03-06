import * as utils from '../../libs/lib/api_utils';
import { loadContextFromHeader, touch } from '../../libs/lib/bitwarden';
import { mapFolder } from '../../libs/lib/mappers';
import { folderRepository } from '../../libs/db/folder-repository';

export const postHandler = async (event, context, callback): Promise<void> => {
  console.log('Folder create handler triggered', JSON.stringify(event, null, 2));

  if (!event.body) {
    callback(null, utils.validationError('Missing request body'));
    return;
  }

  const body = utils.normalizeBody(JSON.parse(event.body));

  let user;
  try {
    ({ user } = await loadContextFromHeader(event.headers.Authorization));
  } catch (e) {
    callback(null, utils.validationError(`User not found: ${e.message}`));
    return;
  }

  if (!body.name) {
    callback(null, utils.validationError('Missing folder name'));
    return;
  }

  try {
    const folder = await folderRepository.createFolder(user.get('pk'), body.name);
    await touch(user);

    callback(null, utils.okResponse(mapFolder(folder)));
  } catch (e) {
    callback(null, utils.serverError('Server error saving folder', e));
  }
};

export const putHandler = async (event, context, callback): Promise<void> => {
  console.log('Folder edit handler triggered', JSON.stringify(event, null, 2));
  if (!event.body) {
    callback(null, utils.validationError('Missing request body'));
    return;
  }

  const body = utils.normalizeBody(JSON.parse(event.body));

  let user;
  try {
    ({ user } = await loadContextFromHeader(event.headers.Authorization));
  } catch (e) {
    callback(null, utils.validationError(`Cannot load user from access token: ${e}`));
    return;
  }

  if (!body.name) {
    callback(null, utils.validationError('Missing folder name'));
    return;
  }

  const folderUuid = event.pathParameters.uuid;
  if (!folderUuid) {
    callback(null, utils.validationError('Missing folder ID'));
  }

  try {
    let folder = await folderRepository.getFolderById(user.get('pk'), folderUuid);

    if (!folder) {
      callback(null, utils.validationError('Unknown folder'));
      return;
    }

    folder.set({ name: body.name });

    folder = await folder.updateAsync();
    await touch(user);

    callback(null, utils.okResponse(mapFolder(folder)));
  } catch (e) {
    callback(null, utils.serverError('Server error saving folder', e));
  }
};

export const deleteHandler = async (event, context, callback): Promise<void> => {
  console.log('Folder delete handler triggered', JSON.stringify(event, null, 2));

  let user;
  try {
    ({ user } = await loadContextFromHeader(event.headers.Authorization));
  } catch (e) {
    callback(null, utils.validationError('User not found'));
  }

  const folderUuid = event.pathParameters.uuid;
  if (!folderUuid) {
    callback(null, utils.validationError('Missing folder ID'));
  }

  try {
    await folderRepository.deleteFolderById(user.get('pk'), folderUuid);
    await touch(user);

    callback(null, utils.okResponse(''));
  } catch (e) {
    callback(null, utils.validationError(e.toString()));
  }
};
