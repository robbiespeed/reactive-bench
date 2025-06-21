import type { Disposer } from "#lib/frameworks/metron-o/lib/shared";

export const EMITTER = Symbol();

export interface Emittable {
  readonly [EMITTER]: Emitter;
}

export type EmitterChannel = InstanceType<typeof EmitterChannel>;
export type EmitController = InstanceType<typeof EmitController>;

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
      const count = queue.length;
      for (let i = 0; i < count; i++) {
        const item = queue[i]!;
        item.canQueue = true;
        try {
          item.handler();
        } catch (err) {
          this.#errorHandler(err);
        }
      }
      if (count < queue.length) {
        queue.splice(0, queue.length - count);
      } else {
        queue.length = 0;
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
  static Controller = class EmitController {
    emitter = new Emitter();
    emit(): undefined {
      let item = this.emitter.#subscriptionHead;
      while (item !== undefined) {
        if (item.canQueue) {
          item.canQueue = false;
          item.queue.push(item);
        }
        item = item.next;
      }
    }
  };
}

export const EmitController = Emitter.Controller;
export const EmitterChannel = Emitter.Channel;
