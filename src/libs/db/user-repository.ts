import { Item } from "dynogels";
import { User } from "./models";
import { TwoFactorTypeKey, Twofactor } from "../../services/twofactor-api/models";
import { encode } from "hi-base32";
import crypto from 'crypto';

export class UserRepository {

    static USER_PREFIX = 'USER::';

    static PARTITION_KEY = 'pk';
    static  SORT_KEY = 'sk';

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

    createTwofactor<T>(user: Item, twofactor: Twofactor<T>): Promise<Item> {
        const userUuid = user.get(UserRepository.PARTITION_KEY);
        const recoveryCode = !!user.get('recoveryCode') ? user.get('recoveryCode') : encode(crypto.randomBytes(20));
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

    removeTwofactorByType(user: Item, type: TwoFactorTypeKey): Promise<Item> {
        const userUuid = user.get(UserRepository.PARTITION_KEY);
        let params: any = {};
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
            recoveryCode: null
        });
    }

}

export const userRepository = new UserRepository();
