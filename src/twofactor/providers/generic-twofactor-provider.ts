import { Item } from "dynogels";
import { GetTwofactorResponse, TwoFactorType, Twofactor } from "../models";
import { userRepository, UserRepository } from "../../db/user-repository";
import { BaseTwofactorProvider } from "./base-twofactor-provider";

export class GenericTwofactorProvider extends BaseTwofactorProvider {

    constructor(userRepository: UserRepository) {
        super(userRepository);
    }
    
    validate(user: Item, twofactorCode: string, selectedData: string): boolean {
        throw new Error("Method not implemented.");
    }

    getAvailableTwofactors(user: Item): Twofactor<any>[] {
        return Object.keys(user.get('twofactors')).map(key => user.get('twofactors')[key]);
    }

    mapToTwofactorProviders(twofactors: Twofactor<any>[]): GetTwofactorResponse {
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
        };
    }

    deleteAllTwofactors(userUuid: string): Promise<Item> {
        return userRepository.deleteAllTwofactors(userUuid);
    }

}

export const genericTwofactorProvider = new GenericTwofactorProvider(userRepository);
