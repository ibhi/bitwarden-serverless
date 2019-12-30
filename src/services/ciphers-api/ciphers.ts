import S3 from 'aws-sdk/clients/s3';
import * as utils from '../../libs/lib/api_utils';
import { loadContextFromHeader, buildCipherDocument, touch } from '../../libs/lib/bitwarden';
import { mapCipher } from '../../libs/lib/mappers';
import { cipherRepository, AttachmentDocument } from '../../libs/db/cipher-repository';
import { UserRepository } from '../../libs/db/user-repository';

const s3 = new S3();

export const postHandler = async (event, context, callback): Promise<void> => {
  console.log('Cipher create handler triggered', JSON.stringify(event, null, 2));

  if (!event.body) {
    callback(null, utils.validationError('Request body is missing'));
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

  if (!body.type || !body.name) {
    callback(null, utils.validationError('Missing name and type of vault item'));
    return;
  }

  try {
    const cipher = await cipherRepository.createCipher(buildCipherDocument(body, user, null));

    await touch(user);

    callback(null, utils.okResponse({ ...await mapCipher(cipher), Edit: true }));
  } catch (e) {
    callback(null, utils.serverError('Server error saving vault item', e));
  }
};

export const putHandler = async (event, context, callback): Promise<void> => {
  console.log('Cipher edit handler triggered', JSON.stringify(event, null, 2));
  if (!event.body) {
    callback(null, utils.validationError('Request body is missing'));
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

  if (!body.type || !body.name) {
    callback(null, utils.validationError('Missing name and type of vault item'));
    return;
  }

  const cipherUuid = event.pathParameters.uuid;
  if (!cipherUuid) {
    callback(null, utils.validationError('Missing vault item ID'));
  }

  try {
    let cipher = await cipherRepository.getCipherById(user.get('pk'), cipherUuid);

    if (!cipher) {
      callback(null, utils.validationError('Unknown vault item'));
      return;
    }

    cipher.set(buildCipherDocument(body, user, cipherUuid));

    cipher = await cipher.updateAsync();
    await touch(user);

    callback(null, utils.okResponse({ ...await mapCipher(cipher), Edit: true }));
  } catch (e) {
    callback(null, utils.serverError('Server error saving vault item', e));
  }
};

export const deleteHandler = async (event, context, callback): Promise<void> => {
  console.log('Cipher delete handler triggered', JSON.stringify(event, null, 2));

  let user;
  try {
    ({ user } = await loadContextFromHeader(event.headers.Authorization));
  } catch (e) {
    callback(null, utils.validationError(`User not found: ${e.message}`));
  }

  const cipherUuid = event.pathParameters.uuid;
  if (!cipherUuid) {
    callback(null, utils.validationError('Missing vault item ID'));
  }

  try {
    const attachments: {[key: string]: AttachmentDocument} = (await cipherRepository
      .getCipherById(user.get(UserRepository.PARTITION_KEY), cipherUuid)
    ).get('attachments') || {};
    // Delete all attachments belonging to the cipher from s3 before deleting the cipher
    await Promise.all(Object.keys(attachments)
      .map((key) => attachments[key])
      .map((attachment) => s3.deleteObject({
        Bucket: process.env.ATTACHMENTS_BUCKET || '',
        Key: `${cipherUuid}/${attachment.uuid}`,
      }).promise()));

    await cipherRepository.deleteCipherById(user.get('pk'), cipherUuid);
    await touch(user);

    callback(null, utils.okResponse(''));
  } catch (e) {
    callback(null, utils.validationError(e.toString()));
  }
};
