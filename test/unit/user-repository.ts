import { UserRepository } from '../../src/db/user-repository';
import { User } from '../../src/db/models';
import { v4 as uuidV4 } from 'uuid';
import { expect } from 'chai';
import * as AWS from 'aws-sdk';
import { TwoFactorType, TwoFactorTypeKey } from '../../src/twofactor/models';
import { Twofactor } from '../../src/lib/models';
import { throws } from 'assert';
const userRepository = new UserRepository();
// const AWS = require('aws-sdk');

const config = {
    endpoint: 'http://localhost:8000',
    region: 'eu-west-1',
}

var dynogels = require('dynogels');
dynogels.dynamoDriver(new AWS.DynamoDB(config));

describe('User repository', () => {

    describe('Direct user data scenarios', () => {
        let userUuid = `USER#${uuidV4()}`;

        beforeEach(async()=> {
            // Create user
            await User.createAsync({
                pk: userUuid,
                sk: userUuid,
                email: 'test@gmail.com',
                passwordHash: 'test',
                kdfType: 1000,
                jwtSecret: 'jwtSecret'
            });
        });

        it('should get the user by id', async () => {
            // Get and assert user
            const user = await userRepository.getUserById(userUuid);

            expect(user.get('pk')).to.equals(userUuid);
            expect(user.get('sk')).to.equals(userUuid);
            expect(user.get('email')).to.equals('test@gmail.com');
            expect(user.get('passwordHash')).to.equals('test');
            expect(user.get('kdfType')).to.equals(1000);
            expect(user.get('jwtSecret')).to.equals('jwtSecret');

        });

        it('should get the user by email from UserEmailIndex', async () => {
            const user = await userRepository.getUserByEmail('test@gmail.com');

            expect(user.get('pk')).to.equals(userUuid);
            expect(user.get('sk')).to.equals(userUuid);
            expect(user.get('email')).to.equals('test@gmail.com');
            expect(user.get('passwordHash')).to.equals('test');
            expect(user.get('kdfType')).to.equals(1000);
            expect(user.get('jwtSecret')).to.equals('jwtSecret');
        });

        afterEach(async() => {
            // Remove user
            const user = await userRepository.getUserById(userUuid);
            await user.destroyAsync();
        });
    });

    describe('Twofactor scenarios', () => {
        let userUuid = `USER#${uuidV4()}`;

        beforeEach(async()=> {
            // Create user
            await User.createAsync({
                pk: userUuid,
                sk: userUuid,
                email: 'test@gmail.com',
                passwordHash: 'test',
                kdfType: 1000,
                jwtSecret: 'jwtSecret'
            });
        });

        it('should create a twofactor (authenticator) for a given user', async () => {

            // Add twofactor
            const userWithTwofactor = await userRepository.createTwofactor(userUuid, {
                typeKey: TwoFactorTypeKey.Authenticator,
                type: TwoFactorType.Authenticator,
                enabled: true,
                data: 'GAUDCLBKKFYE45KRJBBWE3J4KQ7ECTT2NZLH24DRKE4FEN2FJFKQ'
            });

            const twofactor = userWithTwofactor.get('twofactors')[TwoFactorTypeKey.Authenticator];
            expect(twofactor.type).is.equals(0);
            expect(twofactor.enabled).is.true;
            expect(twofactor.data).is.eql('GAUDCLBKKFYE45KRJBBWE3J4KQ7ECTT2NZLH24DRKE4FEN2FJFKQ');
        });

        it('should create a twofactor (u2f) for a given user', async () => {

            // Add twofactor
            const userWithTwofactor = await userRepository.createTwofactor(userUuid, {
                typeKey: TwoFactorTypeKey.U2f,
                type: TwoFactorType.U2f,
                enabled: true,
                data: [
                    {
                        id: 1,
                        name: 'test-key-1',
                        reg: {
                            pubKey: 'BFy-TegwbryXOJ1xMtzXvLXDASqIZd_J2SLdgVMJ95J0q-mdDDxDHI9c6XM5mPn40MzhLqtNCu6D3d6POKha5Sg',
                            keyHandle: 'TKJH3ry1HwSkS20jzSUIjfRXx9CnMC9kpf-RpRngRZaWODYk9U9xsxnb3EH-DXL89McRNTs9XmLF1LvYEMdPgA',
                            attestationCert: {
                                type: "Buffer",
                                data: [48,130,2,189,48,130,1,165,160,3,2]
                            }
                        },
                        compromised: false,
                        counter: 0
                    }
                ]
            });

            const twofactor = userWithTwofactor.get('twofactors')[TwoFactorTypeKey.U2f];
            expect(twofactor.type).is.equals(TwoFactorType.U2f);
            expect(twofactor.enabled).is.true;
            expect(twofactor.data[0].name).is.eql('test-key-1');
        });

        it('should create a both twofactor (authenticator and u2f) for a given user', async () => {

            // Add twofactor
            await userRepository.createTwofactor(userUuid, {
                typeKey: TwoFactorTypeKey.Authenticator,
                type: TwoFactorType.Authenticator,
                enabled: true,
                data: 'GAUDCLBKKFYE45KRJBBWE3J4KQ7ECTT2NZLH24DRKE4FEN2FJFKQ'
            });

            await userRepository.createTwofactor(userUuid, {
                typeKey: TwoFactorTypeKey.U2f,
                type: TwoFactorType.U2f,
                enabled: true,
                data: [
                    {
                        id: 1,
                        name: 'test-key-1',
                        reg: {
                            pubKey: 'BFy-TegwbryXOJ1xMtzXvLXDASqIZd_J2SLdgVMJ95J0q-mdDDxDHI9c6XM5mPn40MzhLqtNCu6D3d6POKha5Sg',
                            keyHandle: 'TKJH3ry1HwSkS20jzSUIjfRXx9CnMC9kpf-RpRngRZaWODYk9U9xsxnb3EH-DXL89McRNTs9XmLF1LvYEMdPgA',
                            attestationCert: {
                                type: "Buffer",
                                data: [48,130,2,189,48,130,1,165,160,3,2]
                            }
                        },
                        compromised: false,
                        counter: 0
                    }
                ]
            });

            const user = await userRepository.getUserById(userUuid);
            console.log(`User after update ${JSON.stringify(user)}`);

            const twofactorAuth = user.get('twofactors')[TwoFactorTypeKey.Authenticator];
            expect(twofactorAuth.type).is.equals(TwoFactorType.Authenticator);
            expect(twofactorAuth.enabled).is.true;
            expect(twofactorAuth.data).is.eql('GAUDCLBKKFYE45KRJBBWE3J4KQ7ECTT2NZLH24DRKE4FEN2FJFKQ');

            const twofactorU2f = user.get('twofactors')[TwoFactorTypeKey.U2f];
            expect(twofactorU2f.type).is.equals(TwoFactorType.U2f);
            expect(twofactorU2f.enabled).is.true;
            expect(twofactorU2f.data[0].name).is.eql('test-key-1');
        });

        afterEach(async() => {
            // Remove user
            const user = await userRepository.getUserById(userUuid);
            await user.destroyAsync();
        });

    });
    
});