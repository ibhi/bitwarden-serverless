import { Item } from 'dynogels';

export class UpdateProfileRequestModel {
  private masterpasswordhint: string;

  private name: string;

  toUser(existingUser: Item): Item {
    return existingUser.set({
      name: this.name,
      passwordHint: this.masterpasswordhint,
    });
  }
}
