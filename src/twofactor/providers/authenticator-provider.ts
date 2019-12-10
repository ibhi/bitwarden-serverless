import { TwofactorProvider } from '../twofactor-provider';
import { GenericTwofactorProvider } from '../generic-twofactor-provider';
import { Item } from 'dynogels';
import { TwoFactorType, GetAuthenticatorResponse } from '../models';
import { Twofactor } from '../../lib/models';
import speakeasy from 'speakeasy';

export class AuthenticatorProvider implements TwofactorProvider {

    async getTwofactor(userUuid: string): Promise<Item> {
        return (await Twofactor
            .query(userUuid)
            .filterExpression('#type = :t')
            .expressionAttributeValues({ ':t' : TwoFactorType.Authenticator })
            .expressionAttributeNames({ '#type' : 'aType'})
            // .projectionExpression('#title, tag')
            .execAsync()
        ).Items[0]
    }

    validate(userUuid: string, twofactorCode: string, selectedData: string): boolean {
        return speakeasy.totp.verify({
            secret: selectedData,
            encoding: 'base32',
            token: twofactorCode,
          });
    }

    getAuthenticatorResponse(twofactorItem: Item) {
        let result: GetAuthenticatorResponse;

        if(twofactorItem && twofactorItem.get('enabled')) {
            result = {
                Object: "twoFactorAuthenticator",
                Enabled: true,
                Key: twofactorItem.get('data')
            };
        } else {
            result = {
                Object: "twoFactorAuthenticator",
                Enabled: false,
                Key: speakeasy.generateSecret().base32
            };
        }
        return result;
    }

}