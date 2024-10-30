import { EMITTER } from "./atom.js";
import type { Disposer } from "./shared.js";

export interface Emittable {
  readonly [EMITTER]: Emitter;
}

export type EmitterChannel = InstanceType<typeof Emitter.Channel>;

/**
 * Due to TS bug this needs to be exported
 * @internal
 */
export interface Subscription {
  canQueue: boolean;
  handler: () => void;
  queue: Subscription[];
  next?: Subscription;
  prev?: Subscription;
}

const disposedHandler = () => {};

export class Emitter implements Emittable {
  #subscriptionHead?: Subscription;
  get [EMITTER](): this {
    return this;
  }
  static #emit(this: Emitter): undefined {
    let item = this.#subscriptionHead;
    while (item !== undefined) {
      if (item.canQueue) {
        item.canQueue = false;
        item.queue.push(item);
      }
      item = item.next;
    }
  }
  static Channel = class EmitterChannel {
    #queue: Subscription[] = [];
    #errorHandler: (cause: unknown) => void;
    constructor(errorHandler: (cause: unknown) => void) {
      this.#errorHandler = errorHandler;
    }
    subscribe(emittable: Emittable, handler: () => void): Disposer {
      const emitter = emittable[EMITTER];
      const subHead = emitter.#subscriptionHead;
      const sub: Subscription = {
        canQueue: true,
        handler,
        queue: this.#queue,
        next: subHead,
        prev: undefined,
      };
      if (subHead !== undefined) {
        subHead.prev = sub;
      }
      emitter.#subscriptionHead = sub;

      return EmitterChannel.#disposer.bind(emitter, sub);
    }
    run(): void {
      const queue = this.#queue;
      let item = queue.pop();
      while (item !== undefined) {
        item.canQueue = true;
        try {
          item.handler();
        } catch (err) {
          this.#errorHandler(err);
        }
        item = queue.pop();
      }
    }
    static #disposer(this: Emitter, sub: Subscription): undefined {
      if (sub.handler === disposedHandler) {
        return;
      }
      sub.canQueue = false;
      sub.handler = disposedHandler;
      const { prev } = sub;
      if (prev === undefined) {
        this.#subscriptionHead = sub.next;
      } else {
        prev.next = sub.next;
      }
    }
  };
  static create(): {
    emitter: Emitter;
    emit: () => undefined;
  } {
    const emitter = new Emitter();
    return { emitter, emit: Emitter.#emit.bind(emitter) };
  }
}

export const createEmitter = Emitter.create;
export const EmitterChannel = Emitter.Channel;
