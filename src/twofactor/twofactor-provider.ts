import { Item } from "dynogels";
import { GetTwofactorResponse } from "./models";

export interface TwofactorProvider {
    validate(userUuid: string, twofactorCode: string, selectedData: string): boolean
    getTwofactor(userUuid: string): Promise<Item>
    // getAllAvailableTwofactors(userUuid: string): Promise<GetTwofactorResponse>
}