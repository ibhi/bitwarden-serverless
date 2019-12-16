import { Item } from "dynogels";
import { User } from "./models";
import { TwoFactorType, TwoFactorTypeKey } from "../twofactor/models";
import { encode } from "hi-base32";
import crypto from 'crypto';
import { ChallengeResponse, U2FRegistration, Registration } from "../two_factor";
import * as u2f from 'u2f';


const APP_ID = 'https://localhost:8080';
const U2F_VERSION = 'U2F_V2';

export interface Twofactor<T> {
    typeKey: TwoFactorTypeKey;
    type: TwoFactorType;
    enabled: boolean;
    data: T[];
}

export class UserRepository {

    static USER_PREFIX = 'USER::';

    static twofactorKeyToTypeMap = new Map<TwoFactorType, TwoFactorTypeKey>([
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

    createUser(user: any): Promise<Item> {
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

    updateUserKeys(userUuid: string, privateKey: string, publicKey: string): Promise<Item> {
        return User.updateAsync({
            pk: userUuid,
            sk: userUuid,
            privateKey,
            publicKey
        });
    }

    updateUser(userUuid: string, params: any): Promise<Item> {
        return User.updateAsync({
            pk: userUuid,
            sk: userUuid,
            ...params
        });
    }

    createTwofactor<T>(user: Item, twofactor: Twofactor<T>): Promise<Item> {
        const userUuid = user.get('pk');
        const recoveryCode = !!!user.get('recoveryCode') ? user.get('recoveryCode') : encode(crypto.randomBytes(20));
        let params: any = {};
        params.UpdateExpression = `SET #twofactors.${twofactor.typeKey} = :twofactor, #recoveryCode = :recoveryCode`;
        params.ExpressionAttributeNames = {
            '#twofactors' : 'twofactors',
            '#recoveryCode': 'recoveryCode'
        };
        params.ExpressionAttributeValues = {
            ':twofactor' : twofactor,
            ':recoveryCode': recoveryCode
        };

        return User.updateAsync({
            pk: userUuid,
            sk: userUuid,
        }, params);
    }

    async createU2fChallenge(user: Item, type: TwoFactorType): Promise<ChallengeResponse> {
        const challengeResponse: ChallengeResponse = u2f.request(APP_ID);
        const typeKey = UserRepository.twofactorKeyToTypeMap.get(type) || TwoFactorTypeKey.U2f;

        const twofactor: Twofactor<ChallengeResponse> = {
            typeKey: typeKey,
            type: type,
            enabled: true,
            data: [challengeResponse]
        };

        await this.createTwofactor(user, twofactor);

        return challengeResponse;
    }

    

    removeTwofactorByType(userUuid: string, type: TwoFactorType): Promise<Item> {
        console.log('Type value ' + type);
        console.log('Map: ' + JSON.stringify(UserRepository.twofactorKeyToTypeMap));
        const typeKey = UserRepository.twofactorKeyToTypeMap.get(type);
        console.log('Type key value ' + typeKey);
        let params: any = {};
        params.UpdateExpression = `REMOVE twofactors.${typeKey}`;
        // params.ExpressionAttributeNames = {
        //     '#twofactors' : 'twofactors'
        // };

        return User.updateAsync({
            pk: userUuid,
            sk: userUuid,
        }, params);
    }

    getTwofactorByType<T>(user: Item, type: TwoFactorType): Twofactor<T> {
        const twofactors: Map<TwoFactorTypeKey, Twofactor<T>> = user.get('twofactors');
        // If none of the type matches return Authenticator
        const key: TwoFactorTypeKey = UserRepository.twofactorKeyToTypeMap.get(type) || TwoFactorTypeKey.Authenticator; 
        return twofactors[key];
    }

    deleteAllTwofactors(userUuid: string): Promise<Item> {
        return User.updateAsync({
            pk: userUuid,
            sk: userUuid,
            twofactors: {},
            recoveryCode: null
        });
    }

}

export const userRepository = new UserRepository();
