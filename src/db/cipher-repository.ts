import { ItemCollection, Item } from "dynogels";
import { Cipher } from "./models";

export class CipherRepository {

    static CIPHER_PREFIX: string = '::CIPHER::';

    getCipherById(userUuid: string, cipherUuid: string): Promise<Item> {
        return Cipher.getAsync(userUuid, cipherUuid);
    }

    deleteCipherById(userUuid: string, cipherUuid): Promise<Item> {
        return Cipher.destroyAsync(userUuid, cipherUuid);
    }

    async getAllCiphersByUserId(userUuid: string): Promise<Item[]> {
        return (await Cipher
            .query(userUuid)
            .where('sk').beginsWith(CipherRepository.CIPHER_PREFIX)
            .execAsync()
        ).Items;
    }

    createCipher(cipher: any): Promise<Item> {
        return Cipher.createAsync(cipher);
    }

}

export const cipherRepository = new CipherRepository();