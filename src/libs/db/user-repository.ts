import { Item, UpdateItemOptions, ItemCollection } from 'dynogels';
import { encode } from 'hi-base32';
import crypto from 'crypto';
import { v4 as uuidV4 } from 'uuid';
import { User, USER_MODEL_VERSION } from './models';
import { TwoFactorTypeKey, Twofactor } from '../../services/twofactor-api/models';
import { KDF_PBKDF2_ITERATIONS_DEFAULT, KDF_PBKDF2, KDF_PBKDF2_ITERATIONS_MAX } from '../lib/crypto';
import { UserKdfInformation } from './user-kdf-information';

export interface UserDocument {
  pk: string;
  sk: string;
  email: string;
  passwordHash: string;
  passwordHint: string;
  name: string;
  kdfIterations: number;
  kdfType: number;
  key: string;
  privateKey: string;
  publicKey: string;
  jwtSecret: string;
  culture: 'en-US'; // Hard-coded unless supplied from elsewhere
  premium: boolean;
  emailVerified: boolean; // Web-vault requires verified e-mail
  version: number;
}

export class UserRepository {
  static USER_PREFIX = 'USER::';

  static PARTITION_KEY = 'pk';

  static SORT_KEY = 'sk';

  mapToUser(body): UserDocument {
    const userId = `${UserRepository.USER_PREFIX}${uuidV4()}`;
    let encryptedPrivateKey; let
      publicKey;
    if (body.keys) {
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
      jwtSecret: this.generateSecret(),
      culture: 'en-US', // Hard-coded unless supplied from elsewhere
      premium: true,
      emailVerified: true, // Web-vault requires verified e-mail,
      version: USER_MODEL_VERSION,
    };
  }

  createUser(user: UserDocument): Promise<Item> {
    return User.createAsync(user);
  }

  getUserById(userUuid: string): Promise<Item> {
    return User.getAsync(userUuid, userUuid);
  }

  async getUserByEmail(email: string): Promise<Item> {
    const [user] = (await User.query(email.toLowerCase())
      .usingIndex('UserEmailIndex')
      .execAsync()).Items;
    return user;
  }

  async getKdfInformationByEmail(email: string): Promise<UserKdfInformation> {
    return User.query(email.toLowerCase())
      .usingIndex('UserEmailIndex')
      .execAsync()
      .then((itemCollection: ItemCollection) => itemCollection.Items[0])
      .then((user: Item | null | undefined) => {
        if (!user) {
          throw new Error('Invalid email');
        }
        return {
          Kdf: user.get('kdfType') || KDF_PBKDF2,
          KdfIterations: user.get('kdfIterations') || KDF_PBKDF2_ITERATIONS_MAX,
        };
      });
  }

  createTwofactor<T>(user: Item, twofactor: Twofactor<T>): Promise<Item> {
    const userUuid = user.get(UserRepository.PARTITION_KEY);
    const recoveryCode = user.get('recoveryCode') ? user.get('recoveryCode') : encode(crypto.randomBytes(20));
    const params: UpdateItemOptions = {};
    params.UpdateExpression = `SET #twofactors.${twofactor.typeKey} = :twofactor, #recoveryCode = :recoveryCode`;
    params.ExpressionAttributeNames = {
      '#twofactors': 'twofactors',
      '#recoveryCode': 'recoveryCode',
    };
    params.ExpressionAttributeValues = {
      ':twofactor': twofactor,
      ':recoveryCode': recoveryCode,
    };

    return User.updateAsync({
      pk: userUuid,
      sk: userUuid,
    }, params);
  }

  removeTwofactorByType(user: Item, type: TwoFactorTypeKey): Promise<Item> {
    const userUuid = user.get(UserRepository.PARTITION_KEY);
    const params: UpdateItemOptions = {};
    params.UpdateExpression = `REMOVE twofactors.${type}`;

    return User.updateAsync({
      pk: userUuid,
      sk: userUuid,
    }, params);
  }

  deleteAllTwofactors(userUuid: string): Promise<Item> {
    return User.updateAsync({
      pk: userUuid,
      sk: userUuid,
      twofactors: {},
      recoveryCode: null,
    });
  }

  private generateSecret(): string {
    return crypto.randomBytes(64).toString('hex');
  }
}

export const userRepository = new UserRepository();
