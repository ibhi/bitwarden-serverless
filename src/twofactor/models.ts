
export enum TwoFactorType {
    Authenticator = 0,
    Email = 1,
    Duo = 2,
    YubiKey = 3,
    U2f = 4,
    Remember = 5,
    OrganizationDuo = 6,
    U2fRegisterChallenge = 1000,
    U2fLoginChallenge = 1001,
    EmailVerificationChallenge = 1002,
}

export enum TwoFactorTypeKey {
    Authenticator = 'authenticator',
    Email = 'email',
    Duo = 'duo',
    YubiKey = 'yubiKey',
    U2f = 'u2f',
    Remember = 'remember',
    OrganizationDuo = 'organizationDuo',
    U2fRegisterChallenge = 'u2fRegisterChallenge',
    U2fLoginChallenge = 'u2fLoginChallenge',
    EmailVerificationChallenge = 'emailVerificationChallenge',
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