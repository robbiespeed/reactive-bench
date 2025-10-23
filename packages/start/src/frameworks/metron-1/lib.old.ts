export interface Subscription {
  run(): undefined;
  dispose(): undefined;
}

export interface Emittable {
  [EMITTER](): Emitter;
}

// interface SubscriptionChannel {
//   subscribe(owner: Emitter, handler: () => unknown): Subscription;
//   run(): undefined;
// }

type ErrorHandler = (cause: unknown) => undefined

const disposedHandler = () => { };

const EMITTER = Symbol();

// Private
let unboundEmit: (this: Emitter) => undefined;

// Exported
let _SubscriptionChannel;

export class Emitter implements Emittable {
  #subscriptionHead: Subscription | undefined;
  constructor(initialize: (emit: () => undefined) => undefined) {
    initialize.call(this, unboundEmit.bind(this));
  }
  [EMITTER]() {
    return this;
  }
  static {
    class Subscription {
      #canQueue = true;
      #owner!: Emitter;
      #handler!: () => unknown;
      #channelQueue!: Subscription[];
      #next?: Subscription;
      #prev?: Subscription;
      run(): undefined {
        this.#canQueue = false;
        this.#handler();
      }
      dispose(): undefined {
        if (this.#handler === disposedHandler) {
          return;
        }
        this.#canQueue = false;
        this.#handler = disposedHandler;
        if (this.#prev === undefined) {
          this.#owner.#subscriptionHead = this.#next;
        } else {
          this.#prev.#next = this.#next;
        }
      }
      static {
        unboundEmit = function emit(this: Emitter) {
          let item = this.#subscriptionHead as (Subscription | undefined);
          while (item !== undefined) {
            if (item.#canQueue) {
              item.#canQueue = false;
              item.#channelQueue.push(item);
            }
            item = item.#next;
          }
        }
        _SubscriptionChannel = class SubscriptionChannel {
          #queue: Subscription[] = [];
          #errorHandler: ErrorHandler;
          #i = 0;
          constructor(errorHandler: ErrorHandler) {
            this.#errorHandler = errorHandler;
          }
          subscribe(emittable: Emittable, handler: () => unknown) {
            const owner = emittable[EMITTER]();
            const sub = new Subscription();
            sub.#owner = owner;
            sub.#handler = handler;
            sub.#channelQueue = this.#queue;
            const subHead = owner.#subscriptionHead as Subscription;
            sub.#next = subHead;
            if (subHead !== undefined) {
              subHead.#prev = sub;
            }
            owner.#subscriptionHead = sub;
            return sub;
          }
          run(): undefined {
            const queue = this.#queue;
            if (queue.length === 0) {
              return;
            }
            while (this.#i < queue.length) {
              const item = queue[this.#i++]!;
              try {
                item.run();
              } catch (err) {
                this.#errorHandler(err);
              }
            }
            this.#i = 0;
            queue.length = 0;
          }
        }
      }
    }
  }
}

export const SubscriptionChannel = _SubscriptionChannel;

export const ORB = Symbol("Orb");

// Atom being the emitter is problematic because it means forwarding isn't possible. So things like list.map() would need it's own Orb and links.
export interface Atom<TValue> extends Emittable {
  [ORB](): Orb;
  unwrap(): TValue;
}

class Orb { }

class StateAtom<TValue> extends Emitter {
  #emit!: () => undefined;
  constructor() {
    super(StateAtom.#init);
  }
  static #init(this: StateAtom<unknown>, emit: () => undefined): undefined {
    this.#emit = emit;
  }
}