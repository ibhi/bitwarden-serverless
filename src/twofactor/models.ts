
export enum TwoFactorType {
    Authenticator = 0,
    Email = 1,
    Duo = 2,
    YubiKey = 3,
    U2f = 4,
    Remember = 5,
    OrganizationDuo = 6,
}

export interface GetTwofactorResponse {
    ContinuationToken: string | null;
    Data: GetTwofactorResponseData[];
    Object: "list";
}

export interface GetTwofactorResponseData {
    Enabled: boolean;
    Object: string;
    Type: number;
}

export interface GetAuthenticatorResponse { 
    Object: string; 
    Enabled: boolean; 
    Key: string; 
}