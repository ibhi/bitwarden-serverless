import { UserKdfInformation } from "../../../libs/db/user-kdf-information";

export class PreloginResponseModel {
    private Kdf: number;
    private KdfIterations: number;
    constructor(userKdfInformation: UserKdfInformation) {
        this.Kdf = userKdfInformation.Kdf;
        this.KdfIterations = userKdfInformation.Kdf;
    }
}