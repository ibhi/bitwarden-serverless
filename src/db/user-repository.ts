import { Item } from "dynogels";
import { User } from "./models";
import { TwoFactorType, TwoFactorTypeKey } from "../twofactor/models";

export interface Twofactor {
    typeKey: TwoFactorTypeKey;
    type: TwoFactorType;
    enabled: boolean;
    data: any;
}

export class UserRepository {

    createUser(user: Item): Promise<Item> {
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

    createTwofactor(userUuid: string, twofactor: Twofactor): Promise<Item> {
        var params: any = {};
        params.UpdateExpression = `SET #twofactors.${twofactor.typeKey} = :twofactor`;
        params.ExpressionAttributeNames = {
            '#twofactors' : 'twofactors'
        };
        params.ExpressionAttributeValues = {
            ':twofactor' : twofactor
        };

        return User.updateAsync({
            pk: userUuid,
            sk: userUuid,
        }, params);
    }
}