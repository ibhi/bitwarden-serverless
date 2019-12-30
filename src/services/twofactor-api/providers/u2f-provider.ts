import * as u2f from 'u2f';
import { Item, UpdateItemOptions } from 'dynogels';
import {
  ChallengeResponse,
  DeviceResponse,
  RegistrationCheckResponse,
  TwoFactorType,
  TwoFactorTypeKey,
  U2FRegistration,
  Twofactor,
  SignResponse,
} from '../models';
import { userRepository, UserRepository } from '../../../libs/db/user-repository';
import { BaseTwofactorProvider } from './base-twofactor-provider';
import { User } from '../../../libs/db/models';
// import { User } from '../../lib/models';

const APP_ID = 'https://localhost:8080';

export class U2fProvider extends BaseTwofactorProvider {
  async validate(user: Item, twofactorCode: string): Promise<boolean> {
    // In this case we are not going to use the selectedData,
    // as we have the login challenge stored in the database
    // from the previous authentication challenge request
    const twofactor: Twofactor<ChallengeResponse> = this.getTwofactor(
      user,
      TwoFactorType.U2fLoginChallenge,
    );
    let challenge: ChallengeResponse;

    if (twofactor && twofactor.data) {
      [challenge] = twofactor.data;
    } else {
      return false;
    }

    // Now we can delete the U2fLoginChallenge
    await this.removeTwofactor(user, TwoFactorType.U2fLoginChallenge);
    const response: SignResponse = JSON.parse(twofactorCode);
    const { keyHandle } = response;

    const registrations: U2FRegistration[] = this.getU2fRegistrations(user);

    if (registrations.length === 0) {
      throw Error('No U2F devices registered');
    }

    // twofactor code contains signature created by one of the registered u2f device
    // find that one using the keyHandle and use it to verify

    const matchedRegistration: U2FRegistration = registrations
      .filter((registration) => registration.keyHandle === keyHandle)[0];

    const result = u2f.checkSignature(challenge, response, matchedRegistration.pubKey);

    if (result.successful) {
      if (matchedRegistration.counter < result.counter) {
        await this.updateU2fCounter(user, registrations, keyHandle, result.counter);
        return true;
      }
      await this.updateU2fCompromised(user, registrations, keyHandle, true);
      throw Error('This device might be compromised!');
    }

    return false;
  }

  checkRegistration(
    challengeResponse: ChallengeResponse,
    deviceResponse: DeviceResponse,
  ): RegistrationCheckResponse {
    return u2f.checkRegistration(challengeResponse, deviceResponse);
  }

  async createU2fChallenge(user: Item, type: TwoFactorType): Promise<ChallengeResponse> {
    const challengeResponse: ChallengeResponse = u2f.request(APP_ID);
    const typeKey = this.twofactorKeyToTypeMap.get(type) || TwoFactorTypeKey.U2f;

    const twofactor: Twofactor<ChallengeResponse> = {
      typeKey,
      type,
      enabled: true,
      data: [challengeResponse],
    };

    await this.createTwofactor(user, twofactor);

    return challengeResponse;
  }

  async createU2fLoginChallenges(user: Item): Promise<ChallengeResponse[]> {
    const data = this.getU2fRegistrations(user)
      .map((registration) => u2f.request(APP_ID, registration.keyHandle) as ChallengeResponse);

    const twofactor: Twofactor<ChallengeResponse> = {
      type: TwoFactorType.U2fLoginChallenge,
      typeKey: TwoFactorTypeKey.U2fLoginChallenge,
      enabled: true,
      data,
    };

    await this.userRepository.createTwofactor(user, twofactor);
    return data;
  }

  async updateU2fCounter(
    user: Item,
    registrations: U2FRegistration[],
    keyHandle: string,
    counter: number,
  ): Promise<Item> {
    const index = registrations.findIndex((reg) => reg.keyHandle === keyHandle);
    // Todo: Move this logic to user repository
    const params: UpdateItemOptions = {};
    params.UpdateExpression = `SET #twofactors.u2f.#data[${index}].#counter = :counter`;
    params.ExpressionAttributeNames = {
      '#twofactors': 'twofactors',
      '#data': 'data',
      '#counter': 'counter',
    };
    params.ExpressionAttributeValues = {
      ':counter': counter,
    };

    return User.updateAsync({
      pk: user.get(UserRepository.PARTITION_KEY),
      sk: user.get(UserRepository.SORT_KEY),
    }, params);
  }

  async updateU2fCompromised(
    user: Item,
    registrations: U2FRegistration[],
    keyHandle: string,
    compromised: boolean,
  ): Promise<Item> {
    const index = registrations.findIndex((reg) => reg.keyHandle === keyHandle);
    // Todo: Move this logic to user repository
    const params: UpdateItemOptions = {};
    params.UpdateExpression = `SET #twofactors.u2f.#data[${index}].#compromised = :compromised`;
    params.ExpressionAttributeNames = {
      '#twofactors': 'twofactors',
      '#data': 'data',
      '#compromised': 'compromised',
    };
    params.ExpressionAttributeValues = {
      ':compromised': compromised,
    };

    return User.updateAsync({
      pk: user.get(UserRepository.PARTITION_KEY),
      sk: user.get(UserRepository.SORT_KEY),
    }, params);
  }

  async removeU2fRegistration(user: Item, index: number): Promise<Item> {
    // Todo: Move this logic to user repository
    const params: UpdateItemOptions = {};
    params.UpdateExpression = `REMOVE #twofactors.u2f.#data[${index}]`;
    params.ExpressionAttributeNames = {
      '#twofactors': 'twofactors',
      '#data': 'data',
    };

    return User.updateAsync({
      pk: user.get(UserRepository.PARTITION_KEY),
      sk: user.get(UserRepository.SORT_KEY),
    }, params);
  }

  private getU2fRegistrations(user: Item): U2FRegistration[] {
    const twofactor: Twofactor<U2FRegistration> = this.getTwofactor(user, TwoFactorType.U2f);
    return twofactor.data;
  }
}

export const u2fProvider = new U2fProvider(userRepository);
