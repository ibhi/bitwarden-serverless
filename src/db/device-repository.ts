import { Item } from 'dynogels';
import { Device } from './models';
import { v4 as uuidV4 } from 'uuid';

export class DeviceRepository {

    static DEVICE_PREFIX = '::DEVICE::';

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
            sk: `${DeviceRepository.DEVICE_PREFIX}${deviceId}`
        });
    }
}

export const deviceRepository = new DeviceRepository();