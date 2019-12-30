import { Item } from 'dynogels';
import { TwoFactorTypeKey, TwoFactorType, Twofactor } from '../models';
import { UserRepository } from '../../../libs/db/user-repository';

export abstract class BaseTwofactorProvider {
  constructor(protected userRepository: UserRepository) {}

  protected twofactorKeyToTypeMap = new Map<TwoFactorType, TwoFactorTypeKey>([
    [TwoFactorType.Authenticator, TwoFactorTypeKey.Authenticator],
    [TwoFactorType.Duo, TwoFactorTypeKey.Duo],
    [TwoFactorType.Email, TwoFactorTypeKey.Email],
    [TwoFactorType.EmailVerificationChallenge, TwoFactorTypeKey.EmailVerificationChallenge],
    [TwoFactorType.OrganizationDuo, TwoFactorTypeKey.OrganizationDuo],
    [TwoFactorType.Remember, TwoFactorTypeKey.Remember],
    [TwoFactorType.U2f, TwoFactorTypeKey.U2f],
    [TwoFactorType.U2fLoginChallenge, TwoFactorTypeKey.U2fLoginChallenge],
    [TwoFactorType.U2fRegisterChallenge, TwoFactorTypeKey.U2fRegisterChallenge],
  ]);

  getTwofactor<T>(user: Item, type: TwoFactorType): T {
    const twofactors: Map<TwoFactorTypeKey, T> = user.get('twofactors');
    const key: TwoFactorTypeKey = this.twofactorKeyToTypeMap.get(type)
      || TwoFactorTypeKey.Authenticator;
    return twofactors[key];
  }

  createTwofactor<T>(user: Item, twofactor: Twofactor<T>): Promise<Item> {
    return this.userRepository.createTwofactor(user, twofactor);
  }

  removeTwofactor(user: Item, type: TwoFactorType): Promise<Item> {
    const typeKey = this.twofactorKeyToTypeMap.get(type) || TwoFactorTypeKey.Authenticator;
    return this.userRepository.removeTwofactorByType(user, typeKey);
  }
}
