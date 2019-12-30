import { Item } from 'dynogels';
import {
  GetTwofactorResponse, Twofactor, ChallengeResponse, U2FRegistration,
} from '../models';
import { userRepository } from '../../../libs/db/user-repository';
import { BaseTwofactorProvider } from './base-twofactor-provider';

export type TwofactorData = ChallengeResponse | U2FRegistration | string;

export class GenericTwofactorProvider extends BaseTwofactorProvider {
  getAvailableTwofactors(user: Item): Twofactor<TwofactorData>[] {
    return Object.keys(user.get('twofactors')).map((key) => user.get('twofactors')[key]);
  }

  mapToTwofactorProviders(twofactors: Twofactor<TwofactorData>[]): GetTwofactorResponse {
    const data = twofactors.map((twofactor) => (
      {
        Enabled: twofactor.enabled,
        Object: 'twoFactorProvider',
        Type: twofactor.type,
      }
    ));

    return {
      ContinuationToken: null,
      Data: data,
      Object: 'list',
    };
  }

  deleteAllTwofactors(userUuid: string): Promise<Item> {
    return this.userRepository.deleteAllTwofactors(userUuid);
  }
}

export const genericTwofactorProvider = new GenericTwofactorProvider(userRepository);
