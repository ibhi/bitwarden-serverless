import { Item } from 'dynogels';
import prettyBytes from 'pretty-bytes';
import { S3 } from 'aws-sdk';
import {
  AttachmentDocument, Fields, Login,
} from '../db/cipher-repository';

const s3 = new S3();

export interface AttachmentResponse {
  Id: string;
  Url: string;
  FileName: string;
  Key: string;
  Size: number;
  SizeName: string;
  Object: 'attachment';
}

export interface CipherResponse {
  Id: string;
  Type: number;
  RevisionDate: string;
  FolderId?: string;
  Favorite: boolean;
  OrganizationId?: string;
  Attachments?: AttachmentResponse[];
  OrganizationUseTotp: boolean;
  CollectionIds: [];
  Name: string;
  Notes: string;
  Fields: Fields[];
  Login: Login;
  Card: object;
  Identity: object;
  SecureNote: object;
  Object: 'cipher';
}

export interface UserResponse {
  Id: string;
  Name: string;
  Email: string;
  EmailVerified: boolean;
  Premium: boolean;
  MasterPasswordHint: string;
  Culture: string;
  TwoFactorEnabled: boolean;
  Key: string;
  PrivateKey: string;
  SecurityStamp: string;
  Organizations: [];
  Object: 'profile';
}

export interface FolderResponse {
  Id: string;
  Name: string;
  RevisionDate: string;
  Object: 'folder';
}

function getRevisionDate(object: Item): string {
  // dynogels sets updated at only after update
  return object.get('updatedAt') || object.get('createdAt');
}

const mapAttachment = async (
  attachment: AttachmentDocument,
  cipher: Item,
): Promise<AttachmentResponse> => {
  const params = {
    Bucket: process.env.ATTACHMENTS_BUCKET,
    Key: `${cipher.get('sk')}/${attachment.uuid}`,
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
};

const mapAttachments = (cipher: Item): Promise<AttachmentResponse>[] => {
  const attachmentsObj: Map<string, AttachmentDocument> = cipher.get('attachments') || {};
  return Object.keys(attachmentsObj)
    .map((key) => attachmentsObj[key])
    .map((attachment: AttachmentDocument) => mapAttachment(attachment, cipher));
};

export async function mapCipher(cipher: Item): Promise<CipherResponse> {
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

export function mapUser(user: Item): UserResponse {
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

export function mapFolder(folder: Item): FolderResponse {
  return {
    Id: folder.get('sk'),
    Name: folder.get('name'),
    RevisionDate: getRevisionDate(folder),
    Object: 'folder',
  };
}

export function getRevisionDateAsMillis(object): number {
  return (new Date(getRevisionDate(object))).getTime();
}
