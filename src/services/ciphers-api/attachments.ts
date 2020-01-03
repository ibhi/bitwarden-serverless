import S3 from 'aws-sdk/clients/s3';
import uuid4 from 'uuid/v4';
import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { touch, buildAttachmentDocument } from '../../libs/lib/bitwarden';
import { mapCipher } from '../../libs/lib/mappers';
import parseMultipart from '../../libs/lib/multipart';
import { cipherRepository as cipherRepo, CipherRepository } from '../../libs/db/cipher-repository';
import BaseLambda from '../../libs/base-lambda';
import { UserRepository, userRepository as userRepo } from '../../libs/db/user-repository';
import { DeviceRepository, deviceRepository as deviceRepo } from '../../libs/db/device-repository';

export class AttachmentLambda extends BaseLambda {
  constructor(
    userRepository: UserRepository,
    deviceRepository: DeviceRepository,
    private s3: S3,
    private cipherRepository: CipherRepository,
  ) {
    super(userRepository, deviceRepository);
  }

  postHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
    console.log('Attachment create handler triggered', JSON.stringify(event, null, 2));

    if (!event.body) {
      return this.validationError('Request body is missing');
    }

    let user;
    try {
      ({ user } = await this.loadContextFromHeader(event.headers.Authorization));
    } catch (e) {
      return this.validationError(`User not found: ${e.message}`);
    }

    if (!event?.pathParameters?.uuid) {
      return this.validationError('Missing vault item ID');
    }

    const cipherUuid = event.pathParameters.uuid;

    console.log(`Cipher id ${cipherUuid}`);

    try {
      console.log('Before get cipher');
      let cipher = await this.cipherRepository.getCipherById(user.get('pk'), cipherUuid);
      console.log(`After get cipher${JSON.stringify(cipher)}`);
      if (!cipher) {
        return this.validationError('Unknown vault item');
      }

      const multipart = parseMultipart(event);
      if (!multipart.data) {
        return this.validationError('File data is missing');
      }


      const part = multipart.data;
      const attachmentKey = multipart.key;
      console.log(`Content type: ${part.contentType}`);
      part.id = uuid4();
      const params = {
        Body: part.content,
        Bucket: process.env.ATTACHMENTS_BUCKET || '',
        Key: `${cipherUuid}/${part.id}`,
        ContentType: part.contentType,
      };

      await this.s3.putObject(params).promise();

      cipher = await this.cipherRepository
        .createAttachment(cipher, (buildAttachmentDocument(part, attachmentKey)));
      await touch(user);

      return this.okResponse(await mapCipher(cipher));
    } catch (e) {
      return this.serverError('Server error saving vault item', e);
    }
  };

  deleteHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
    console.log('Attachment delete handler triggered', JSON.stringify(event, null, 2));

    let user;
    try {
      ({ user } = await this.loadContextFromHeader(event.headers.Authorization));
    } catch (e) {
      return this.validationError(`User not found: ${e.message}`);
    }

    if (!event?.pathParameters?.uuid) {
      return this.validationError('Missing vault item ID');
    }

    const cipherUuid = event.pathParameters.uuid;
    const { attachmentId } = event.pathParameters;

    try {
      const cipher = await this.cipherRepository.getCipherById(user.get('pk'), cipherUuid);

      if (!cipher) {
        return this.validationError('Unknown vault item');
      }

      const params = {
        Bucket: process.env.ATTACHMENTS_BUCKET as string,
        Key: `${cipherUuid}/${attachmentId}`,
      };

      await this.s3.deleteObject(params).promise();
      await this.cipherRepository.deleteAttachment(cipher, attachmentId);
      await touch(user);

      return this.okResponse('');
    } catch (e) {
      return this.serverError('Server error deleting vault attachment', e);
    }
  };
}

export const attachmentLambda = new AttachmentLambda(
  userRepo, deviceRepo, new S3(), cipherRepo,
);
export const { postHandler, deleteHandler } = attachmentLambda;
