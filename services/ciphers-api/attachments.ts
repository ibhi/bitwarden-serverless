import S3 from 'aws-sdk/clients/s3';
import uuid4 from 'uuid/v4';
import * as utils from '../../libs/lib/api_utils';
import { loadContextFromHeader, touch, buildAttachmentDocument } from '../../libs/lib/bitwarden';
import { mapCipher } from '../../libs/lib/mappers';
// import { Cipher, Attachment } from './lib/models';
import { parseMultipart } from '../../libs/lib/multipart';
import { Cipher } from '../../libs/db/models';
import { cipherRepository } from '../../libs/db/cipher-repository';
import { CORS_HEADERS } from '../../libs/lib/api_utils';

const s3 = new S3();

export const postHandler = async (event, context, callback) => {
  console.log('Attachment create handler triggered', JSON.stringify(event, null, 2));

  if (!event.body) {
    callback(null, utils.validationError('Request body is missing'));
    return;
  }

  const host = event.headers.Host;
  const multipart = parseMultipart(event);
  if (!multipart.data) {
    callback(null, utils.validationError('File data is missing'));
    return;
  }

  console.log('Attachment data ' + JSON.stringify(multipart.data));

  let user;
  try {
    ({ user } = await loadContextFromHeader(event.headers.Authorization));
  } catch (e) {
    callback(null, utils.validationError('User not found: ' + e.message));
    return;
  }

  const cipherUuid = event.pathParameters.uuid;

  console.log(`Cipher id ${cipherUuid}`);

  if (!cipherUuid) {
    callback(null, utils.validationError('Missing vault item ID'));
  }

  try {
    console.log('Before get cipher');
    let cipher = await cipherRepository.getCipherById(user.get('pk'), cipherUuid);
    console.log('After get cipher' + JSON.stringify(cipher));
    if (!cipher) {
      callback(null, utils.validationError('Unknown vault item'));
      return;
    }

    const part = multipart.data;
    const attachmentKey = multipart.key;
    part.id = uuid4();
    const params = {
    //   ACL: 'public-read',
      Body: part.content,
      Bucket: process.env.ATTACHMENTS_BUCKET || '',
      Key: cipherUuid + '/' + part.id,
    };

    await s3.putObject(params).promise();

    cipher = await cipherRepository.createAttachment(cipher, (buildAttachmentDocument(part, attachmentKey)));
    await touch(user);
    // await touch(cipher);

    callback(null, utils.okResponse(await mapCipher(cipher, host)));
  } catch (e) {
    callback(null, utils.serverError('Server error saving vault item', e));
  }
};

export const deleteHandler = async (event, context, callback) => {
    console.log('Attachment delete handler triggered', JSON.stringify(event, null, 2));
  
    let user;
    try {
      ({ user } = await loadContextFromHeader(event.headers.Authorization));
    } catch (e) {
      callback(null, utils.validationError('User not found: ' + e.message));
      return;
    }
    const cipherUuid = event.pathParameters.uuid;
    const { attachmentId } = event.pathParameters;
  
    try {
      let cipher = await cipherRepository.getCipherById(user.get('pk'), cipherUuid);
  
      if (!cipher) {
        callback(null, utils.validationError('Unknown vault item'));
        return;
      }
  
      const params = {
        Bucket: process.env.ATTACHMENTS_BUCKET as string,
        Key: cipherUuid + '/' + attachmentId,
      };
  
      await s3.deleteObject(params).promise();
      await cipherRepository.deleteAttachment(cipher, attachmentId);
      await touch(user);
  
      callback(null, utils.okResponse(''));
    } catch (e) {
      callback(null, utils.serverError('Server error deleting vault attachment', e));
    }
  };

  export const getHandler = async (event, context, callback) => {
    console.log('Attachment get handler triggered', JSON.stringify(event, null, 2));
  
    const cipherUuid = event.pathParameters.uuid;
    const { attachmentId } = event.pathParameters;
  
    try {
  
      const params = {
        Bucket: process.env.ATTACHMENTS_BUCKET as string,
        Key: cipherUuid + '/' + attachmentId,
      };
  
      const attachment = await s3.getObject(params).promise();
      console.log('Attachment is ', attachment.Body?.toString('base64'));
      const response = {
        statusCode: 200,
        headers: {
            'Content-Type': attachment.ContentType,
            'Content-Length': attachment.ContentLength,
            ...CORS_HEADERS
        },
        body: attachment.Body?.toString('base64'),
        isBase64Encoded: true,
      };
  
      callback(null, response);
    } catch (e) {
      callback(null, utils.serverError('Server error deleting vault attachment', e));
    }
  };