import { Item, Model } from "dynogels";
import { Device } from './models';

export class DeviceRepository {

    getDeviceById(userUuid: string, deviceId: string): Promise<Item> {
        return Device.getAsync(userUuid, deviceId);
    }

    createDevice(device: Item): Promise<Item> {
        return Device.createAsync(device);
    }
}