import { Item } from "dynogels";

export function mapCipher(cipher: Item) {
  return {
    Id: cipher.get('uuid'),
    Type: cipher.get('type'),
    RevisionDate: getRevisionDate(cipher),
    FolderId: cipher.get('folderUuid'),
    Favorite: cipher.get('favorite'),
    OrganizationId: cipher.get('organizationUuid'),
    Attachments: cipher.get('attachments'),
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
    Id: user.get('uuid'),
    Name: user.get('name'),
    Email: user.get('email'),
    EmailVerified: user.get('emailVerified'),
    Premium: user.get('premium'),
    MasterPasswordHint: user.get('passwordHint'),
    Culture: user.get('culture'),
    TwoFactorEnabled: !!user.get('totpSecret'),
    Key: user.get('key'),
    PrivateKey: (user.get('privateKey') || '').toString('utf8'),
    SecurityStamp: user.get('securityStamp'),
    Organizations: [],
    Object: 'profile',
  };
}

export function mapFolder(folder: Item) {
  return {
    Id: folder.get('uuid'),
    Name: folder.get('name'),
    RevisionDate: getRevisionDate(folder),
    Object: 'folder',
  };
}

export function getRevisionDateAsMillis(object) {
  return (new Date(getRevisionDate(object))).getTime();
}

function getRevisionDate(object) {
  // dynogels sets updated at only after update
  return object.get('updatedAt') || object.get('createdAt');
}
