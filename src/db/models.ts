import dynogels from 'dynogels-promisified';
import Joi from '@hapi/joi';
import { Model } from 'dynogels';

const usersTableName = process.env.BITWARDEN_TABLE;

// Bind internal dynogels logger to console, it supports warn/info/error as needed
dynogels.log = console;

export const User: Model = dynogels.define('User', {
    hashKey: 'pk',
    rangeKey: 'sk',
    timestamps: true,
    tableName: usersTableName,

    schema: {
        // This is uuid with prefix USER#
        pk: Joi.string().required(),
        verifiedAt: Joi.date().allow(null),
        lastVerifyingAt: Joi.date().allow(null),
        loginVerifyCount: Joi.number().allow(null),

        sk: Joi.string().required(),
        email: Joi.string().email().required(),
        emailNew: Joi.string().email().allow(null),
        emailNewToken: Joi.string().allow(null),
        name: Joi.string().allow(null),

        passwordHash: Joi.string().required(),
        salt: Joi.string().allow(null),
        passwordIterations: Joi.number().allow(null),
        passwordHint: Joi.string().allow(null),

        key: Joi.string(),
        privateKey: Joi.binary(),
        publicKey: Joi.binary(),

        totpSecret: Joi.string().allow(null),
        //   Todo: I guess this is same as recoveryCode
        totpRecover: Joi.string().allow(null),
        // Todo:  I dont thing we need this?
        totpSecretTemp: Joi.string().allow(null),

        securityStamp: dynogels.types.uuid(),

        equivalentDomains: Joi.string().allow(null),
        excludedGlobals: Joi.string().allow(null),

        kdfType: Joi.number().required(),
        kdfIterations: Joi.number().min(5000).max(1e6),

        //   Todo: Verify all the fields below
        jwtSecret: Joi.string().required(),
        emailVerified: Joi.boolean(),
        premium: Joi.boolean(),
        culture: Joi.string(),
        version: Joi.number().allow(null),
        recoveryCode: Joi.string().allow(null),

        // Twofactor
        twofactors: Joi.object().default({}),
    },
    indexes: [{
        hashKey: 'sk', rangeKey: 'pk', name: 'InvertedIndex', type: 'global'
    }, {
        hashKey: 'email', name: 'UserEmailIndex', type: 'global'
    }]
});

export const Device: Model = dynogels.define('Device', {
    hashKey: 'pk',
    rangeKey: 'sk',
    timestamps: true,
    tableName: usersTableName,
  
    schema: {
        //USER#UUID 
        pk: Joi.string().required(),
        // #DEVICE#UUID
        sk: Joi.string().required(),
        name: Joi.string().allow(null),
        type: Joi.number(),
        pushToken: Joi.string().allow(null),
        refreshToken: Joi.string().allow(null),
    },
    indexes: [{
        hashKey: 'refreshToken', name: 'RefreshTokenDeviceIndex', type: 'global'
    }]
  });