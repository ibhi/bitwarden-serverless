import { Folder } from './models';
import { Item } from 'dynogels';

export class FolderRepository {
    static FOLDER_PREFIX = '::FOLDER::'
    async getAllFoldersByUserId(userUuid: string): Promise<Item[]> {
        return (await Folder.query(userUuid)
        .where('sk').beginsWith(FolderRepository.FOLDER_PREFIX)
        .execAsync()).Items;
    }
}

export const folderRepository = new FolderRepository();
