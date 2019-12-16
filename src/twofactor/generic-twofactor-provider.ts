import { TwofactorProvider } from "./providers/twofactor-provider";
import { Twofactor } from "../lib/models";
import { Item, Model } from "dynogels";
import { GetTwofactorResponse, TwoFactorType } from "./models";
import { encode } from "hi-base32";
import crypto from 'crypto';
import { userRepository } from "../db/user-repository";

export class GenericTwofactorProvider {

    async getAllAvailableTwofactors(userUuid: string): Promise<GetTwofactorResponse> {
        const twofactors: Item[] = (await
            Twofactor
                .query(userUuid)
                .execAsync()).Items;
        
        const data = twofactors.map(twofactor => (
            {
                Enabled: twofactor.get('enabled'),
                Object: "twoFactorProvider",
                Type: twofactor.get('aType')
            }
        ));
    
        return {
            ContinuationToken: null,
            Data: data,
            Object: "list"
        }
        
    }

    async getAvailableTwofactors(user: Item): Promise<GetTwofactorResponse> {

        const twofactors = Object.keys(user.get('twofactors')).map(key => user.get('twofactors')[key]);
        
        const data = twofactors.map(twofactor => (
            {
                Enabled: twofactor.enabled,
                Object: "twoFactorProvider",
                Type: twofactor.type
            }
        ));
    
        return {
            ContinuationToken: null,
            Data: data,
            Object: "list"
        }
        
    }

    async getTwofactorByType(userUuid: string, type: number): Promise<Item[]> {
        return (await Twofactor
            .query(userUuid)
            .filterExpression('#type = :t')
            .expressionAttributeValues({ ':t' : type })
            .expressionAttributeNames({ '#type' : 'aType'})
            .execAsync()).Items;
    }

    async generateRecoverCode(user: Item) {
        if(!user.get('recoverCode')) {
            const recoveryCode = encode(crypto.randomBytes(20));
            await userRepository.updateUser(user.get('pk'), { recoveryCode });
        }
    }

    async deleteAllByUser(userUuid: string) {
        await Twofactor.destroyAsync(userUuid);
    }

}

export const genericTwofactorProvider = new GenericTwofactorProvider();
