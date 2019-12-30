import { Item, UpdateItemOptions } from 'dynogels';
import { Cipher } from './models';

export interface AttachmentDocument {
  uuid: string;
  filename: string;
  size: number;
  key: string;
}

export interface Fields {
  Name: string;
  Response: boolean | null;
  Type: number;
  Value: string;
}

export interface Uri {
  Match: boolean;
  Response: boolean;
  Uri: string;
}

export interface Login {
  Username: string;
  Password: string;
  Uris: Uri[];
}

export interface CipherFields {
  pk: string;
  sk: string;
  folderUuid: string;
  type: number;
  version: number;
  favorite: boolean;
  attachments?: AttachmentDocument[];
  name: string;
  notes?: string;
  fields?: Fields[];
}

export interface LoginDocument extends CipherFields {
  login?: Login;
}

export interface SecureNoteDocument extends CipherFields {
  securenote?: { Type: number };
}

export interface IdentityDocument extends CipherFields {
  identity?: object;
}

export interface CardDocument extends CipherFields {
  card?: object;
}

export type CipherDocument =
  LoginDocument | SecureNoteDocument | IdentityDocument | CardDocument;

export class CipherRepository {
  static CIPHER_PREFIX = '::CIPHER::';

  getCipherById(userUuid: string, cipherUuid: string): Promise<Item> {
    return Cipher.getAsync(userUuid, cipherUuid);
  }

  deleteCipherById(userUuid: string, cipherUuid): Promise<Item> {
    return Cipher.destroyAsync(userUuid, cipherUuid);
  }

  async getAllCiphersByUserId(userUuid: string): Promise<Item[]> {
    return (await Cipher
      .query(userUuid)
      .where('sk').beginsWith(CipherRepository.CIPHER_PREFIX)
      .execAsync()
    ).Items;
  }

  createCipher(cipher: CipherDocument): Promise<Item> {
    return Cipher.createAsync(cipher);
  }

  createAttachment(cipher: Item, attachment: AttachmentDocument): Promise<Item> {
    const userId = cipher.get('pk');
    const cipherId = cipher.get('sk');
    const params: UpdateItemOptions = {};
    params.UpdateExpression = 'SET #attachments.#attachmentUuid = :attachment';
    params.ExpressionAttributeNames = {
      '#attachments': 'attachments',
      '#attachmentUuid': attachment.uuid,
    };
    params.ExpressionAttributeValues = {
      ':attachment': attachment,
    };

    return Cipher.updateAsync({
      pk: userId,
      sk: cipherId,
    }, params);
  }

  deleteAttachment(cipher: Item, attachmentId: string): Promise<Item> {
    const userId = cipher.get('pk');
    const cipherId = cipher.get('sk');
    const params: UpdateItemOptions = {};
    params.UpdateExpression = 'REMOVE #attachments.#attachmentUuid';
    params.ExpressionAttributeNames = {
      '#attachments': 'attachments',
      '#attachmentUuid': attachmentId,
    };

    return Cipher.updateAsync({
      pk: userId,
      sk: cipherId,
    }, params);
  }
}

export const cipherRepository = new CipherRepository();
