import { Item } from "dynogels";
import { Cipher } from "./models";

export interface AttachmentDocument {
    uuid: string;
    filename: string;
    size: number;
    key?: string;
}

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

    createAttachment(cipher: Item, attachment: AttachmentDocument): Promise<Item> {
        const userId = cipher.get('pk');
        const cipherId = cipher.get('sk');
        let params: any = {};
        params.UpdateExpression = `SET #attachments.#attachmentUuid = :attachment`;
        params.ExpressionAttributeNames = {
            '#attachments' : 'attachments',
            '#attachmentUuid': attachment.uuid
        };
        params.ExpressionAttributeValues = {
            ':attachment' : attachment,
        };

        return Cipher.updateAsync({
            pk: userId,
            sk: cipherId,
        }, params);
    }

    deleteAttachment(cipher: Item, attachmentId: string) {
        const userId = cipher.get('pk');
        const cipherId = cipher.get('sk');
        let params: any = {};
        params.UpdateExpression = `REMOVE #attachments.#attachmentUuid`;
        params.ExpressionAttributeNames = {
            '#attachments' : 'attachments',
            '#attachmentUuid': attachmentId
        };

        return Cipher.updateAsync({
            pk: userId,
            sk: cipherId,
        }, params);
    }

}

export const cipherRepository = new CipherRepository();