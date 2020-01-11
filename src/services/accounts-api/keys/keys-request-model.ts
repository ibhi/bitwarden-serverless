import { Item } from 'dynogels';
import * as O from 'fp-ts/lib/Option';
import { pipe } from 'fp-ts/lib/pipeable';

export class KeysRequestModel {
  encryptedprivatekey: string;

  publickey?: string;

  constructor(model: KeysRequestModel) {
    this.encryptedprivatekey = model.encryptedprivatekey;
    this.publickey = model.publickey;
  }

  public toUser(user: Item): Item {
    const existingPublicKeyOption: O.Option<string> = O.fromNullable(user.get('publicKey'));
    return pipe(
      O.fromNullable(this.publickey),
      O.map((publicKey) => (O.isNone(existingPublicKeyOption)
        ? user.set({ publicKey })
        : user)),
      O.mapNullable((usr) => usr.get('privateKey') as string | null | undefined),
      O.fold(
        () => user.set({ privateKey: this.encryptedprivatekey }),
        () => user,
      ),
    );
  }
}
