
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
  Object: 'list';
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

export interface ChallengeResponse {
  version: string;
  appId: string;
  challenge: string;
  keyHandle?: string;
}

export interface Registration {
  pubKey: string;
  keyHandle: string;
  attestationCert: string;
}

export interface U2FRegistration {
  id: string | number;
  name: string;
  // reg: Registration;
  counter: number;
  compromised: boolean;
  pubKey: string;
  keyHandle: string;
  attestationCert: string;
}

export interface DeviceResponse {
  clientData: string;
  errorCode: number;
  registrationData: string;
  version: string;
}

export interface RegistrationCheckResponse {
  successful: boolean;
  publicKey: string;
  keyHandle: string;
  certificate: string;
  errorMessage?: string;
}

export interface Twofactor<T> {
  typeKey: TwoFactorTypeKey;
  type: TwoFactorType;
  enabled: boolean;
  data: T[];
}

export interface SignResponse {
  clientData: string;
  errorCode: number;
  keyHandle: string;
  signatureData: string;
}
