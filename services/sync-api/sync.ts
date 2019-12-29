import * as utils from '../../libs/lib/api_utils';
import { loadContextFromHeader } from '../../libs/lib/bitwarden';
import { mapUser, mapCipher, mapFolder } from '../../libs/lib/mappers';
import { cipherRepository } from '../../libs/db/cipher-repository';
import { folderRepository } from '../../libs/db/folder-repository';

export const handler = async (event, context, callback) => {
  console.log('Sync handler triggered', JSON.stringify(event, null, 2));

  let user;
  try {
    ({ user } = await loadContextFromHeader(event.headers.Authorization));
  } catch (e) {
    callback(null, utils.validationError('User not found'));
    return;
  }
  let ciphers;
  let folders;
  try {
    // This is the technique to make calls in parallel 
    const ciphersPromise = cipherRepository.getAllCiphersByUserId(user.get('pk'));
    const foldersPromise = folderRepository.getAllFoldersByUserId(user.get('pk'));

    ciphers = await ciphersPromise;
    folders = await foldersPromise;
  } catch (e) {
    callback(null, utils.serverError('Server error loading vault items', e));
    return;
  }

  const response = {
    Profile: mapUser(user),
    Folders: folders.map(mapFolder),
    Ciphers: await Promise.all(ciphers.map(cipher => mapCipher(cipher))),
    Collections: [],
    Domains: {
      EquivalentDomains: null,
      GlobalEquivalentDomains: [],
      Object: 'domains',
    },
    Object: 'sync',
  };

  callback(null, utils.okResponse(response));
};
