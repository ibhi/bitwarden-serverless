import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bufferEq from 'buffer-equal-constant-time';
import entries from 'object.entries';
import mapKeys from 'lodash/mapKeys';
import { v4 as uuidV4 } from 'uuid';
import { Item } from 'dynogels';
import * as O from 'fp-ts/lib/Option';
import { pipe } from 'fp-ts/lib/pipeable';
import * as TE from 'fp-ts/lib/TaskEither';
import * as E from 'fp-ts/lib/Either';
import { sequenceS } from 'fp-ts/lib/Apply';
import {
  CIPHER_MODEL_VERSION,
} from '../db/models';
import { userRepository } from '../db/user-repository';
import { deviceRepository, DeviceRepository } from '../db/device-repository';
import { CipherRepository, AttachmentDocument, CipherDocument } from '../db/cipher-repository';

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

export interface UserDeviceContext {
  user: Item;
  device: Item;
}

const JWT_DEFAULT_ALGORITHM = 'HS256';

export const TYPE_LOGIN = 1;
export const TYPE_NOTE = 2;
export const TYPE_CARD = 3;
export const TYPE_IDENTITY = 4;
export const DEFAULT_VALIDITY = 60 * 60;

function ucfirst(string): string {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

function createTaskEitherFromPromise<T>(promise: Promise<T>): TE.TaskEither<Error, T> {
  return TE.tryCatch(
    () => promise,
    E.toError,
  );
}

export function loadContext(
  authHeader: O.Option<string>,
): TE.TaskEither<Error, { user: Item; device: Item }> {
  return pipe(
    authHeader,
    O.map((header) => header.replace(/^(Bearer)/, '').trim()),
    E.fromOption(() => new Error('Missing Authorization header')),
    E.map((token) => jwt.decode(token) as JwtPayload),
    E.map((payload) => [payload.sub, payload.device]),
    TE.fromEither,
    TE.map(([userUuid, deviceUuid]) => ({
      user: createTaskEitherFromPromise(userRepository.getUserById(userUuid)),
      device: createTaskEitherFromPromise(deviceRepository.getDeviceById(userUuid, deviceUuid)),
    })),
    TE.chain((taskEitherObj) => sequenceS(TE.taskEither)(taskEitherObj)),
  );
}

export async function loadContextFromHeader(header): Promise<UserDeviceContext> {
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

function generateToken(): string {
  return crypto.randomBytes(64)
    .toString('base64')
    .replace(/\+/g, '-') // Convert '+' to '-'
    .replace(/\//g, '_') // Convert '/' to '_'
    .replace(/=+$/, ''); // Remove ending '='
}

export function regenerateTokens(user, device): Tokens {
  const expiryDate = new Date();
  expiryDate.setTime(expiryDate.getTime() + (DEFAULT_VALIDITY * 1000));

  const notBeforeDate = new Date();
  notBeforeDate.setTime(notBeforeDate.getTime() - (60 * 2 * 1000));

  const tokens: Tokens = {
    tokenExpiresAt: expiryDate,
    refreshToken: device.get('refreshToken'),
    accessToken: undefined,
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

export function hashesMatch(hashA, hashB): boolean {
  return hashA && hashB && bufferEq(Buffer.from(hashA), Buffer.from(hashB));
}

export function buildCipherDocument(body, user: Item, cipherId: string | null): CipherDocument {
  const params = {
    pk: user.get('pk') as string,
    sk: cipherId || `${CipherRepository.CIPHER_PREFIX}${uuidV4()}`,
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
        paramValue = value.map((val) => mapKeys(val, (_, uriKey) => ucfirst(uriKey)));
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

export function buildAttachmentDocument(attachment, attachmentKey): AttachmentDocument {
  return {
    uuid: attachment.id,
    filename: attachment.filename,
    size: attachment.size,
    key: attachmentKey,
  };
}

export async function touch(object: Item): Promise<void> {
  object.set({ updatedAt: new Date().toISOString() });
  await object.updateAsync();
}
