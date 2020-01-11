import { Item } from 'dynogels';
import { ResponseModel } from '../../../libs/lib/response-models';

export class KeysResponseModel extends ResponseModel {
  private readonly Key: string;

  private readonly PrivateKey: string;

  private readonly PublicKey: string;

  constructor(user: Item) {
    super('keys');
    this.Key = user.get('key');
    this.PrivateKey = user.get('privateKey').toString('utf8');
    this.PublicKey = user.get('publicKey').toString('utf8');
  }
}
