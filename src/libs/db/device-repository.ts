import { Item } from 'dynogels';
import { Device } from './models';

export class DeviceRepository {
  static DEVICE_PREFIX = '::DEVICE::';

  static PARTITION_KEY = 'pk';

  static SORT_KEY = 'sk';

  getDeviceById(userUuid: string, deviceId: string): Promise<Item> {
    return Device.getAsync(userUuid, `${DeviceRepository.DEVICE_PREFIX}${deviceId}`);
  }

  async getDeviceByRefreshToken(refreshToken: string): Promise<Item> {
    const [device] = (await Device.query(refreshToken)
      .usingIndex('RefreshTokenDeviceIndex')
      .execAsync()).Items;
    return device;
  }

  createDevice(userUuid: string, deviceId: string): Promise<Item> {
    return Device.createAsync({
      pk: userUuid,
      sk: `${DeviceRepository.DEVICE_PREFIX}${deviceId}`,
    });
  }

  updateTwofactorRemember(
    userUuid: string, deviceId: string,
    twofactorRememberToken: string | null,
  ): Promise<Item> {
    return Device.updateAsync({
      pk: userUuid,
      sk: `${DeviceRepository.DEVICE_PREFIX}${deviceId}`,
      twofactorRemember: twofactorRememberToken,
    });
  }
}

export const deviceRepository = new DeviceRepository();
