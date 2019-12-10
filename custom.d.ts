import { Query, DocumentCollection, Item, Document, Scan, Model } from 'dynogels';

declare module 'dynogels' {
    interface Query {
        execAsync(): Promise<ItemCollection>;
    }

    interface Scan {
        execAsync(): Promise<ItemCollection>;
    }

    interface Model {
        createAsync(item: any): Promise<Item>;
        destroyAsync(hashKey: any): Promise<Item>;
    }

    interface Item {
        destroyAsync(): Promise<Item>;
        saveAsync(): Promise<Item>;
        updateAsync(): Promise<Item>;
    }

    interface ItemCollection {
        Items: Item[];
        Count: number;
        ScannedCount: number;
        ConsumedCapacity: ConsumedCapacity;
        LastEvaluatedKey?: any;
    }
}
