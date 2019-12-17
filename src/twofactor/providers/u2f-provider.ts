import { ChallengeResponse, DeviceResponse, RegistrationCheckResponse, TwoFactorType, TwoFactorTypeKey, Registration, U2FRegistration, Twofactor, SignResponse } from '../models';
import { userRepository, UserRepository } from '../../db/user-repository';
import { BaseTwofactorProvider } from './base-twofactor-provider';
import * as u2f from 'u2f';
import { Item } from 'dynogels';

const APP_ID = 'https://localhost:8080';

export class U2fProvider extends BaseTwofactorProvider {

    constructor(userRepository: UserRepository) {
        super(userRepository);
    }

    async validate(user: Item, twofactorCode: string): Promise<boolean> {
        // In this case we are not going to use the selectedData,
        // as we have the login challenge stored in the database
        // from the previous authentication challenge request
        const twofactor: Twofactor<ChallengeResponse> = this.getTwofactor(user, TwoFactorType.U2fLoginChallenge);
        let challenge: ChallengeResponse;

        if(twofactor && twofactor.data) {
            challenge = twofactor.data[0];
        } else {
            return false;
        }

        // Now we can delete the U2fLoginChallenge
        await this.removeTwofactor(user, TwoFactorType.U2fLoginChallenge);
        const response: SignResponse = JSON.parse(twofactorCode);

        const registrations: Registration[] = this.getU2fRegistrations(user);

        if(registrations.length === 0) {
            throw Error('No U2F devices registered');
        }

        // twofactor code contains signature created by one of the registered u2f device
        // find that one using the keyHandle and use it to verify
        
        const matchedRegistration: Registration = registrations.filter(registration => registration.keyHandle === response.keyHandle)[0];

        const result = u2f.checkSignature(challenge, response, matchedRegistration.pubKey);

        if(result.successful) {
            return true;
        }

        return false;
    }

    checkRegistration(challengeResponse: ChallengeResponse, deviceResponse: DeviceResponse): RegistrationCheckResponse {
        return u2f.checkRegistration(challengeResponse, deviceResponse);    
    }

    async createU2fChallenge(user: Item, type: TwoFactorType): Promise<ChallengeResponse> {
        const challengeResponse: ChallengeResponse = u2f.request(APP_ID);
        const typeKey = this.twofactorKeyToTypeMap.get(type) || TwoFactorTypeKey.U2f;

        const twofactor: Twofactor<ChallengeResponse> = {
            typeKey: typeKey,
            type: type,
            enabled: true,
            data: [challengeResponse]
        };

        await this.createTwofactor(user, twofactor);

        return challengeResponse;
    }

    async createU2fLoginChallenges(user: Item): Promise<ChallengeResponse[]> {
        const data = this.getU2fRegistrations(user)
          .map(registration => u2f.request(APP_ID, registration.keyHandle) as ChallengeResponse);
        
        const twofactor: Twofactor<ChallengeResponse> = {
          type: TwoFactorType.U2fLoginChallenge,
          typeKey: TwoFactorTypeKey.U2fLoginChallenge,
          enabled: true,
          data: data
        };
      
        await userRepository.createTwofactor(user, twofactor);
        return data;
    }

    private getU2fRegistrations(user: Item): Registration[] {
        const twofactor: Twofactor<U2FRegistration> = u2fProvider.getTwofactor(user, TwoFactorType.U2f);
        return twofactor.data.map(d => d.reg);
    }

}

export const u2fProvider = new U2fProvider(userRepository);
