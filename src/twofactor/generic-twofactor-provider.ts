import { TwofactorProvider } from "./twofactor-provider";
import { Twofactor as TwofactorModel, Twofactor } from "../lib/models";
import { Item, Model } from "dynogels";
import { GetTwofactorResponse } from "./models";
import { encode } from "hi-base32";
import crypto from 'crypto';

export class GenericTwofactorProvider {

    async getAllAvailableTwofactors(userUuid: string): Promise<GetTwofactorResponse> {
        const twofactors: Item[] = (await
            TwofactorModel
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
            user.set({
                recoveryCode: recoveryCode
            });
            await user.updateAsync();
        }
    }

    async deleteAllByUser(userUuid: string) {
        await Twofactor.destroyAsync(userUuid);
    }

}

