import { Item } from 'dynogels';
import { generateSecret } from './bitwarden';
import { KDF_PBKDF2_ITERATIONS_DEFAULT } from './crypto';
import { v4 as uuidV4 } from 'uuid';
import { UserRepository } from '../db/user-repository';
import prettyBytes from 'pretty-bytes';
import { AttachmentDocument } from '../db/cipher-repository';
import { S3 } from 'aws-sdk';

const s3 = new S3();

const mapAttachment = async (attachment: AttachmentDocument, cipher: Item) => {
  const params = {
    Bucket: process.env.ATTACHMENTS_BUCKET,
    Key: cipher.get('sk') + '/' + attachment.uuid,
    Expires: 604800, // 1 week
  };

  const url = await s3.getSignedUrlPromise('getObject', params);

  return {
    Id: attachment.uuid,
    Url: url,
    FileName: attachment.filename,
    Key: attachment.key,
    Size: attachment.size,
    SizeName: prettyBytes(attachment.size),
    Object: 'attachment',
  };
}

const mapAttachments = (cipher: Item) => {
  const attachmentsObj: Map<string, AttachmentDocument> = cipher.get('attachments') || {};
  return Object.keys(attachmentsObj) 
    .map(key => attachmentsObj[key])
    .map((attachment: AttachmentDocument) => mapAttachment(attachment, cipher));
}

export async function mapCipher(cipher: Item) {
  return {
    Id: cipher.get('sk'),
    Type: cipher.get('type'),
    RevisionDate: getRevisionDate(cipher),
    FolderId: cipher.get('folderUuid'),
    Favorite: cipher.get('favorite'),
    OrganizationId: cipher.get('organizationUuid'),
    Attachments: await Promise.all(mapAttachments(cipher)),
    OrganizationUseTotp: false,
    CollectionIds: [],
    Name: cipher.get('name'),
    Notes: cipher.get('notes'),
    Fields: cipher.get('fields'),
    Login: cipher.get('login'),
    Card: cipher.get('card'),
    Identity: cipher.get('identity'),
    SecureNote: cipher.get('securenote'),
    Object: 'cipher',
  };
}

export function mapUser(user: Item) {
  return {
    Id: user.get('pk'),
    Name: user.get('name'),
    Email: user.get('email'),
    EmailVerified: user.get('emailVerified'),
    Premium: user.get('premium'),
    MasterPasswordHint: user.get('passwordHint'),
    Culture: user.get('culture'),
    TwoFactorEnabled: Object.keys(user.get('twofactors')).length > 0,
    Key: user.get('key'),
    PrivateKey: (user.get('privateKey') || '').toString('utf8'),
    SecurityStamp: user.get('securityStamp'),
    Organizations: [],
    Object: 'profile',
  };
}

export function mapFolder(folder: Item) {
  return {
    Id: folder.get('sk'),
    Name: folder.get('name'),
    RevisionDate: getRevisionDate(folder),
    Object: 'folder',
  };
}

export function mapToUser(body) {
  const userId = `${UserRepository.USER_PREFIX}${uuidV4()}`
  let encryptedPrivateKey, publicKey;
  if(body.keys) {
      encryptedPrivateKey = body.keys.encryptedPrivateKey;
      publicKey = body.keys.publicKey;
  }
  return {
      pk: userId,
      sk: userId,
      email: body.email.toLowerCase(),
      passwordHash: body.masterpasswordhash,
      passwordHint: body.masterpasswordhint,
      name: body.name,
      kdfIterations: body.kdfiterations || KDF_PBKDF2_ITERATIONS_DEFAULT,
      kdfType: body.kdf,
      key: body.key,
      privateKey: encryptedPrivateKey,
      publicKey,
      jwtSecret: generateSecret(),
      culture: 'en-US', // Hard-coded unless supplied from elsewhere
      premium: true,
      emailVerified: true, // Web-vault requires verified e-mail
  };
}

export function getRevisionDateAsMillis(object) {
  return (new Date(getRevisionDate(object))).getTime();
}

function getRevisionDate(object) {
  // dynogels sets updated at only after update
  return object.get('updatedAt') || object.get('createdAt');
}
