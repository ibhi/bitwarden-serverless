import { Item } from 'dynogels';
import { v4 as uuidV4 } from 'uuid';
import { Folder } from './models';

export class FolderRepository {
  static FOLDER_PREFIX = '::FOLDER::';

  async getAllFoldersByUserId(userUuid: string): Promise<Item[]> {
    return (await Folder.query(userUuid)
      .where('sk').beginsWith(FolderRepository.FOLDER_PREFIX)
      .execAsync()).Items;
  }

  getFolderById(userUuid: string, folderUuid: string): Promise<Item> {
    return Folder.getAsync(userUuid, folderUuid);
  }

  deleteFolderById(userUuid: string, folderUuid: string): Promise<Item> {
    return Folder.destroyAsync(userUuid, folderUuid);
  }

  createFolder(userUuid: string, name: string): Promise<Item> {
    return Folder.createAsync({
      pk: userUuid,
      sk: `${FolderRepository.FOLDER_PREFIX}${uuidV4()}`,
      name,
    });
  }
}

export const folderRepository = new FolderRepository();
