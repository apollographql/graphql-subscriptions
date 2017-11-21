/// <reference types="node" />
import { EventEmitter } from 'events';
export declare function eventEmitterAsyncIterator<T>(eventEmitter: EventEmitter, eventsNames: string | string[]): AsyncIterator<T>;
