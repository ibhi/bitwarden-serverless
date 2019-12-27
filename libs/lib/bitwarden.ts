import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bufferEq from 'buffer-equal-constant-time';
import entries from 'object.entries';
import mapKeys from 'lodash/mapKeys';
import {
  User, Device, CIPHER_MODEL_VERSION, USER_MODEL_VERSION,
} from './models';
import { KDF_PBKDF2_ITERATIONS_DEFAULT } from './crypto';
import { userRepository } from '../db/user-repository';
import { deviceRepository, DeviceRepository } from '../db/device-repository';
import { CipherRepository, AttachmentDocument } from '../db/cipher-repository';
import { v4 as uuidV4 } from 'uuid';

// Types

interface Tokens {
  tokenExpiresAt: Date;
  refreshToken: string;
  accessToken?: string;
}

interface JwtPayload {
  nbf: number;
  exp: number;
  iss: string;
  sub: string;
  premium: string;
  name: string;
  email: string;
  email_verified: string;
  sstamp: string;
  device: string;
  scope: string[];
  amr: string[];
}

const JWT_DEFAULT_ALGORITHM = 'HS256';

export const TYPE_LOGIN = 1;
export const TYPE_NOTE = 2;
export const TYPE_CARD = 3;
export const TYPE_IDENTITY = 4;


export const DEFAULT_VALIDITY = 60 * 60;

export async function loadContextFromHeader(header) {
  if (!header) {
    throw new Error('Missing Authorization header');
  }

  const token: string = header.replace(/^(Bearer)/, '').trim();
  const payload: JwtPayload = jwt.decode(token) as JwtPayload;
  const userUuid = payload.sub;
  const deviceUuid = payload.device;
  const user = await userRepository.getUserById(userUuid);
  const device = await deviceRepository.getDeviceById(userUuid, deviceUuid);

  if (!user || !device) {
    throw new Error('User or device not found from token');
  }

  // Throws on error
  jwt.verify(token, user.get('jwtSecret'), { algorithms: [JWT_DEFAULT_ALGORITHM] });

  if (payload.sstamp !== user.get('securityStamp')) {
    throw new Error('You need to login again after recent profile changes');
  }

  return { user, device };
}

export function regenerateTokens(user, device) {
  const expiryDate = new Date();
  expiryDate.setTime(expiryDate.getTime() + (DEFAULT_VALIDITY * 1000));

  const notBeforeDate = new Date();
  notBeforeDate.setTime(notBeforeDate.getTime() - (60 * 2 * 1000));

  const tokens: Tokens = {
    tokenExpiresAt: expiryDate,
    refreshToken: device.get('refreshToken'),
    accessToken: undefined
  };

  if (!device.get('refreshToken')) {
    tokens.refreshToken = generateToken();
  }

  const payload: JwtPayload = {
    nbf: Math.floor(notBeforeDate.getTime() / 1000),
    exp: Math.floor(expiryDate.getTime() / 1000),
    iss: '/identity',
    sub: user.get('pk'),
    premium: user.get('premium'),
    name: user.get('name'),
    email: user.get('email'),
    email_verified: user.get('emailVerified'),
    sstamp: user.get('securityStamp'),
    // Stripping the prefix from db
    device: device.get('sk').substring(DeviceRepository.DEVICE_PREFIX.length),
    scope: ['api', 'offline_access'],
    amr: ['Application'],
  };

  tokens.accessToken = jwt.sign(payload, user.get('jwtSecret'), { algorithm: JWT_DEFAULT_ALGORITHM });

  return tokens;
}

export function hashesMatch(hashA, hashB) {
  return hashA && hashB && bufferEq(Buffer.from(hashA), Buffer.from(hashB));
}

export function buildCipherDocument(body, user, cipherId) {
  const params = {
    pk: user.get('pk'),
    sk: cipherId ? cipherId :`${CipherRepository.CIPHER_PREFIX}${uuidV4()}`,
    organizationUuid: body.organizationid,
    folderUuid: body.folderid,
    favorite: !!body.favorite,
    type: parseInt(body.type, 10),
    name: body.name,
    notes: body.notes,
    fields: [],
    version: CIPHER_MODEL_VERSION,
  };

  let additionalParamsType;
  if (params.type === TYPE_LOGIN) {
    additionalParamsType = 'login';
  } else if (params.type === TYPE_CARD) {
    additionalParamsType = 'card';
  } else if (params.type === TYPE_IDENTITY) {
    additionalParamsType = 'identity';
  } else if (params.type === TYPE_NOTE) {
    additionalParamsType = 'securenote';
  }

  if (additionalParamsType !== null && additionalParamsType in body) {
    params[additionalParamsType] = {};
    entries(body[additionalParamsType]).forEach(([key, value]) => {
      let paramValue = value;
      if (ucfirst(key) === 'Uris' && value) {
        paramValue = value.map(val => mapKeys(val, (_, uriKey) => ucfirst(uriKey)));
      }
      params[additionalParamsType][ucfirst(key)] = paramValue;
    });
  }

  if (body.fields && Array.isArray(body.fields)) {
    params.fields = body.fields.map((field) => {
      const vals = {};
      entries(field).forEach(([key, value]) => {
        vals[ucfirst(key)] = value;
      });

      return vals;
    });
  }

  return params;
}

export function buildUserDocument(body) {
  return {
    email: body.email.toLowerCase(),
    passwordHash: body.masterpasswordhash,
    passwordHint: body.masterpasswordhint,
    kdfIterations: body.kdfiterations || KDF_PBKDF2_ITERATIONS_DEFAULT,
    key: body.key,
    jwtSecret: generateSecret(),
    culture: 'en-US', // Hard-coded unless supplied from elsewhere
    premium: true,
    emailVerified: true, // Web-vault requires verified e-mail
    version: USER_MODEL_VERSION,
  };
}

export function buildAttachmentDocument(attachment, attachmentKey): AttachmentDocument {
  return {
    uuid: attachment.id,
    filename: attachment.filename,
    size: attachment.size,
    key: attachmentKey,
  };
}

export function generateSecret() {
  return crypto.randomBytes(64).toString('hex');
}

export async function touch(object) {
  object.set({ updatedAt: new Date().toISOString() });
  await object.updateAsync();
}

function generateToken() {
  return crypto.randomBytes(64)
    .toString('base64')
    .replace(/\+/g, '-') // Convert '+' to '-'
    .replace(/\//g, '_') // Convert '/' to '_'
    .replace(/=+$/, ''); // Remove ending '='
}

function ucfirst(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}
