import { Item } from 'dynogels';
import { ResponseModel } from '../../../libs/lib/response-models';

export class ProfileResponseModel extends ResponseModel {
  private Id: string;

  private Name: string;

  private Email: string;

  private EmailVerified: boolean;

  private Premium: boolean;

  private MasterPasswordHint: string;

  private Culture: string;

  private TwoFactorEnabled: boolean;

  private Key: string;

  private PrivateKey: string;

  private SecurityStamp: string;

  private Organizations: [];

  constructor(user: Item) {
    super('profile');
    this.Id = user.get('pk');
    this.Name = user.get('name');
    this.Email = user.get('email');
    this.EmailVerified = user.get('emailVerified');
    this.Premium = user.get('premium');
    this.MasterPasswordHint = user.get('passwordHint');
    this.Culture = user.get('culture');
    this.TwoFactorEnabled = Object.keys(user.get('twofactors')).length > 0;
    this.Key = user.get('key');
    this.PrivateKey = (user.get('privateKey') || '').toString('utf8');
    this.SecurityStamp = user.get('securityStamp');
    this.Organizations = [];
  }
}
