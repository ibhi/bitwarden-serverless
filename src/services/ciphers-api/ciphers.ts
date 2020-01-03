import S3 from 'aws-sdk/clients/s3';
import { APIGatewayEvent, APIGatewayProxyResult } from 'aws-lambda';
import { buildCipherDocument, touch } from '../../libs/lib/bitwarden';
import { mapCipher } from '../../libs/lib/mappers';
import {
  cipherRepository as cipherRepo,
  AttachmentDocument,
  CipherRepository,
} from '../../libs/db/cipher-repository';
import { UserRepository, userRepository as userRepo } from '../../libs/db/user-repository';
import BaseLambda from '../../libs/base-lambda';
import { DeviceRepository, deviceRepository as deviceRepo } from '../../libs/db/device-repository';

export class CipherLambda extends BaseLambda {
  constructor(
    userRepository: UserRepository,
    deviceRepository: DeviceRepository,
    private cipherRepository: CipherRepository,
    private s3: S3,
  ) {
    super(userRepository, deviceRepository);
  }

  postHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
    console.log('Cipher create handler triggered', JSON.stringify(event, null, 2));

    if (!event.body) {
      return this.validationError('Request body is missing');
    }

    const body = this.normalizeBody(JSON.parse(event.body));

    let user;
    try {
      ({ user } = await this.loadContextFromHeader(event.headers.Authorization));
    } catch (e) {
      return this.validationError(`User not found: ${e.message}`);
    }

    if (!body.type || !body.name) {
      return this.validationError('Missing name and type of vault item');
    }

    try {
      const cipher = await this.cipherRepository
        .createCipher(buildCipherDocument(body, user, null));
      await touch(user);

      return this.okResponse({ ...await mapCipher(cipher), Edit: true });
    } catch (e) {
      return this.serverError('Server error saving vault item', e);
    }
  };

  putHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
    console.log('Cipher edit handler triggered', JSON.stringify(event, null, 2));
    if (!event.body) {
      return this.validationError('Request body is missing');
    }

    const body = this.normalizeBody(JSON.parse(event.body));

    let user;
    try {
      ({ user } = await this.loadContextFromHeader(event.headers.Authorization));
    } catch (e) {
      return this.validationError(`User not found: ${e.message}`);
    }

    if (!body.type || !body.name) {
      return this.validationError('Missing name and type of vault item');
    }


    if (!event?.pathParameters?.uuid) {
      return this.validationError('Missing vault item ID');
    }
    const cipherUuid = event.pathParameters.uuid;

    try {
      let cipher = await this.cipherRepository.getCipherById(user.get('pk'), cipherUuid);

      if (!cipher) {
        return this.validationError('Unknown vault item');
      }

      cipher.set(buildCipherDocument(body, user, cipherUuid));

      cipher = await cipher.updateAsync();
      await touch(user);

      return this.okResponse({ ...await mapCipher(cipher), Edit: true });
    } catch (e) {
      return this.serverError('Server error saving vault item', e);
    }
  };

  deleteHandler = async (event: APIGatewayEvent): Promise<APIGatewayProxyResult> => {
    console.log('Cipher delete handler triggered', JSON.stringify(event, null, 2));

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

    try {
      const attachments: { [key: string]: AttachmentDocument } = (await this.cipherRepository
        .getCipherById(user.get(UserRepository.PARTITION_KEY), cipherUuid)
      ).get('attachments') || {};
      // Delete all attachments belonging to the cipher from s3 before deleting the cipher
      await Promise.all(Object.keys(attachments)
        .map((key) => attachments[key])
        .map((attachment) => this.s3.deleteObject({
          Bucket: process.env.ATTACHMENTS_BUCKET || '',
          Key: `${cipherUuid}/${attachment.uuid}`,
        }).promise()));

      await this.cipherRepository.deleteCipherById(user.get('pk'), cipherUuid);
      await touch(user);

      return this.okResponse('');
    } catch (e) {
      return this.validationError(e.toString());
    }
  };
}

export const cipherLambda = new CipherLambda(
  userRepo,
  deviceRepo,
  cipherRepo,
  new S3(),
);
export const { postHandler, putHandler, deleteHandler } = cipherLambda;
