import { Item } from "dynogels";
import { GetTwofactorResponse, GetAuthenticatorResponse } from "../models";

export interface TwofactorProvider {
    validate(userUuid: string, twofactorCode: string, selectedData: string): boolean;
    getTwofactor(user: Item): GetAuthenticatorResponse;
    // getAllAvailableTwofactors(userUuid: string): Promise<GetTwofactorResponse>
}