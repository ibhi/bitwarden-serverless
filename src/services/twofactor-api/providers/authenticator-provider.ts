import speakeasy from 'speakeasy';
import { Twofactor, GetAuthenticatorResponse } from '../models';
import { userRepository } from '../../../libs/db/user-repository';
import { BaseTwofactorProvider } from './base-twofactor-provider';

export class AuthenticatorProvider extends BaseTwofactorProvider {
  validate(twofactorCode: string, selectedData: string): boolean {
    return speakeasy.totp.verify({
      secret: selectedData,
      encoding: 'base32',
      token: twofactorCode,
    });
  }

  getAuthenticatorResponse(authenticatorTwofactor: Twofactor<string>): GetAuthenticatorResponse {
    let result: GetAuthenticatorResponse;
    if (authenticatorTwofactor && authenticatorTwofactor.enabled) {
      result = {
        Object: 'twoFactorAuthenticator',
        Enabled: true,
        Key: authenticatorTwofactor.data[0],
      };
    } else {
      result = {
        Object: 'twoFactorAuthenticator',
        Enabled: false,
        Key: speakeasy.generateSecret().base32,
      };
    }

    return result;
  }
}

export const authenticatorProvider = new AuthenticatorProvider(userRepository);
