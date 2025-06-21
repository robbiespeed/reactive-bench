import type { Disposer, Reader } from "./shared.js";

interface Link {
  version: number;
  consumer: unknown;
  source: Orb;
  nextSource: Link | undefined;
  nextConsumer: Link | undefined;
  prevConsumer: Link;
}

interface RecycledLink {
  version: number;
  consumer: undefined;
  source: undefined;
  nextSource: RecycledLink | undefined;
  nextConsumer: undefined;
  prevConsumer: undefined;
}

interface Emittable {
  readonly [ORB]: Orb;
}

export const ORB = Symbol();

const MAX_INT = 0x7fffffff;

const MAX_VERSION = 0x7ffffffe;
const MAX_RECYCLE_VERSION = 0x7ffffff0;

export let clean: () => undefined;

let _OrbController;
let _OrbStaticController;
let _EmitterChannel;

/**
 * Due to TS bug this needs to be exported
 * @internal
 */
interface Subscription {
  canQueue: boolean;
  handler: () => void;
  queue: Subscription[];
  next?: Subscription;
  prev?: Subscription;
}

const ORB_FLAG_DIRTY = 0b0001;
const ORB_FLAG_PROJECTION = 0b0010;

export class Orb {
  // TODO try merging flags and depth. Dirty flag can be 0b10000000, and max depth 0b01111111
  #flags = 0b0000;
  #projectionDepth = -1;
  #consumerHead: Link | undefined;
  #subscriptionHead: Subscription | undefined;
  #receiver: unknown;
  #emit(): undefined {
    let item = this.#subscriptionHead;
    while (item !== undefined) {
      if (item.canQueue) {
        item.canQueue = false;
        item.queue.push(item);
      }
      item = item.next;
    }
  }
  static {
    let recycledLinkPool: RecycledLink | undefined;
    let dirtyReceiverPool: Receiver | undefined;

    class Receiver {
      #sourceHead: Link | undefined;
      #sourceTail: Link | undefined;
      #transmitOrb: WeakRef<Orb> | Orb | undefined;
      #nextDirty: Receiver | undefined;
      #version = 0;
      constructor(orb: WeakRef<Orb> | Orb) {
        this.#transmitOrb = orb;
      }
      #linkSource(source: Orb): undefined {
        const tail = this.#sourceTail;
        let nextOld: Link | undefined;
        if (tail !== undefined) {
          if (tail.source === source) {
            return;
          }
          nextOld = tail.nextSource;
        } else {
          nextOld = this.#sourceHead;
        }

        if (nextOld !== undefined && nextOld.source === source) {
          nextOld.version = this.#version;
          nextOld.consumer = this;
          this.#sourceTail = nextOld;
          return;
        }

        let link: Link;
        if (recycledLinkPool === undefined) {
          link = {
            version: this.#version,
            source,
            consumer: this,
            nextSource: nextOld,
            nextConsumer: undefined,
            prevConsumer: undefined as any,
          };
        } else {
          link = recycledLinkPool as any;
          recycledLinkPool = recycledLinkPool.nextSource;
          link.consumer = this;
          link.source = source;
          link.nextSource = nextOld;
          link.version = this.#version;
        }

        const sourceConsumers = source.#consumerHead;
        if (sourceConsumers === undefined) {
          link.prevConsumer = link;
          source.#consumerHead = link;
        } else {
          const oldConsumerTail = sourceConsumers.prevConsumer!;
          sourceConsumers.prevConsumer = link;
          link.prevConsumer = oldConsumerTail;
          oldConsumerTail.nextConsumer = link;
        }

        if (tail === undefined) {
          this.#sourceHead = link;
        } else {
          tail.nextSource = link;
        }
        this.#sourceTail = link;
      }
      #staticLinkSource(source: Orb): undefined {
        const tail = this.#sourceTail;
        let link: Link;
        if (recycledLinkPool === undefined) {
          link = {
            version: MAX_INT,
            source,
            consumer: this,
            nextSource: undefined,
            nextConsumer: undefined,
            prevConsumer: undefined as any,
          };
        } else {
          link = recycledLinkPool as any;
          recycledLinkPool = recycledLinkPool.nextSource;
          link.consumer = this;
          link.source = source;
          link.nextSource = undefined;
          link.version = MAX_INT;
        }

        const sourceConsumers = source.#consumerHead;
        if (sourceConsumers === undefined) {
          link.prevConsumer = link;
          source.#consumerHead = link;
        } else {
          const oldConsumerTail = sourceConsumers.prevConsumer!;
          sourceConsumers.prevConsumer = link;
          link.prevConsumer = oldConsumerTail;
          oldConsumerTail.nextConsumer = link;
        }

        if (tail === undefined) {
          this.#sourceHead = link;
        } else {
          tail.nextSource = link;
        }
        this.#sourceTail = link;
      }
      #scheduleCleaning() {
        if (this.#nextDirty !== undefined) {
          // Already scheduled
          return;
        }
        const sourcesTail = this.#sourceTail;
        if (
          (sourcesTail !== undefined
            ? sourcesTail.nextSource
            : this.#sourceHead) !== undefined
        ) {
          this.#nextDirty = dirtyReceiverPool ?? this;
          dirtyReceiverPool = this;
        }
      }
      static {
        let recycledReceiverPool: Receiver | undefined;

        function stabilize(orb: Orb) {
          if (orb.#projectionDepth >= 0) {
            runProjections(orb.#projectionDepth);
          }
          orb.#flags ^= ORB_FLAG_DIRTY;
        }

        function runProjections(depth: number) {}

        function cleanReceiver(receiver: Receiver): undefined {
          const sourcesTail = receiver.#sourceTail;
          let link =
            sourcesTail !== undefined
              ? sourcesTail.nextSource
              : receiver.#sourceHead;
          while (link !== undefined) {
            const source = link.source;
            const prevConsumer = link.prevConsumer;
            if (prevConsumer === link) {
              source.#consumerHead = undefined;
            } else {
              const nextConsumer = link.nextConsumer;
              if (nextConsumer === undefined) {
                source.#consumerHead!.prevConsumer = prevConsumer;
              } else {
                nextConsumer.prevConsumer = prevConsumer;
              }
              if (link === source.#consumerHead) {
                source.#consumerHead = nextConsumer;
              } else {
                prevConsumer.nextConsumer = nextConsumer;
              }
            }

            const nextLink = link.nextSource;
            (link as unknown as RecycledLink).nextSource = recycledLinkPool;
            recycledLinkPool = link as unknown as RecycledLink;

            recycledLinkPool.consumer = undefined;
            recycledLinkPool.source = undefined;
            recycledLinkPool.nextConsumer = undefined;
            recycledLinkPool.prevConsumer = undefined;

            link = nextLink;
          }

          if (sourcesTail === undefined) {
            receiver.#sourceHead = undefined;
            if (
              receiver.#transmitOrb === undefined &&
              receiver.#version < MAX_RECYCLE_VERSION
            ) {
              receiver.#nextDirty = recycledReceiverPool;
              recycledReceiverPool = receiver;
            }
          } else {
            sourcesTail.nextSource = undefined;
          }
        }

        function createReceiver(orb: Orb | WeakRef<Orb>): Receiver {
          if (recycledReceiverPool === undefined) {
            return new Receiver(orb);
          }
          const receiver = recycledReceiverPool;
          recycledReceiverPool = recycledReceiverPool.#nextDirty;
          receiver.#transmitOrb = orb;
          receiver.#nextDirty = undefined;
          return receiver;
        }

        function transmit(orb: Orb): undefined {
          orb.#emit();

          const stack: Link[] = [];
          let link = orb.#consumerHead;
          let consumer: Receiver;
          let nextConsumerLink: Link | undefined;
          let linkVersion: number;

          while (link !== undefined) {
            consumer = link.consumer as Receiver;
            nextConsumerLink = link.nextConsumer;
            linkVersion = link.version;
            consumerHandler: if (consumer.#version <= linkVersion) {
              let consumerOrb = consumer.#transmitOrb;
              if (consumerOrb === undefined) {
                break consumerHandler;
              }
              if ("deref" in consumerOrb) {
                consumerOrb = consumerOrb.deref();
                if (consumerOrb === undefined) {
                  consumer.#version++;
                  consumer.#transmitOrb = undefined;
                  consumer.#sourceTail = undefined;
                  consumer.#scheduleCleaning();
                  break consumerHandler;
                }
              }

              if (consumerOrb.#flags & ORB_FLAG_PROJECTION) {
                //
              } else {
                consumerOrb.#emit();
                if (linkVersion !== MAX_INT) {
                  consumer.#sourceTail = undefined;
                  if ((consumer.#version = linkVersion + 1) === MAX_VERSION) {
                    // If Orb is managed then automatically create new strong receiver
                    // otherwise allow weak receiver to be created lazily
                    consumerOrb.#receiver =
                      consumer.#transmitOrb === consumerOrb
                        ? createReceiver(consumerOrb)
                        : undefined;
                    consumer.#transmitOrb = undefined;
                  }
                  consumer.#scheduleCleaning();
                }
                const childLinks = consumerOrb.#consumerHead;
                if (childLinks !== undefined) {
                  if (nextConsumerLink !== undefined) {
                    stack.push(nextConsumerLink);
                  }
                  link = childLinks;
                  continue;
                }
              }
            }

            link = nextConsumerLink ?? stack.pop();
          }
          PropagationChannel.run();
        }

        function disposeReceiver(orb: Orb) {
          const receiver = orb.#receiver as Receiver | undefined;
          if (receiver === undefined) {
            return;
          }
          orb.#receiver = undefined;
          receiver.#version++;
          receiver.#transmitOrb = undefined;
          receiver.#sourceTail = undefined;
          receiver.#scheduleCleaning();
          transmit(orb);
        }

        class OrbController {
          #orb: Orb = new Orb();
          static {
            _OrbController = this;
          }
          get orb() {
            return this.#orb;
          }
          manage(): Disposer {
            let orb: Orb | undefined = this.#orb;
            let receiver = orb.#receiver as Receiver | undefined;
            if (receiver === undefined) {
              orb.#receiver = createReceiver(orb);
            } else {
              if (receiver.#transmitOrb === orb) {
                throw new Error("Attempted to manage orb multiple times");
              }
              receiver.#transmitOrb = orb;
            }

            return () => {
              orb !== undefined && (disposeReceiver(orb), (orb = undefined));
            };
          }
          receiveRaw<T>(fn: (link: (input: Orb) => undefined) => T): T {
            const receiver = (this.#orb.#receiver ??= createReceiver(
              new WeakRef(this.#orb)
            )) as Receiver;
            const version = receiver.#version;
            const link = (orb: Orb): undefined => {
              if (version !== receiver.#version) {
                throw new Error("Attempted to use expired read");
              }
              receiver.#linkSource(orb);
            };

            return fn(link);
          }
          receive<T>(fn: (read: Reader) => T): T {
            const receiver = (this.#orb.#receiver ??= createReceiver(
              new WeakRef(this.#orb)
            )) as Receiver;
            const version = receiver.#version;
            const read: Reader = (atom) => {
              if (version !== receiver.#version) {
                throw new Error("Attempted to use expired read");
              }
              receiver.#linkSource(atom[ORB]);
              return atom.unwrap();
            };

            return fn(read);
          }
          transmit(): undefined {
            transmit(this.#orb);
          }
        }

        class OrbStaticController {
          #orb: Orb = new Orb();
          static {
            _OrbStaticController = this;
          }
          get orb() {
            return this.#orb;
          }
          manage(): Disposer {
            let orb: Orb | undefined = this.#orb;
            let receiver = orb.#receiver as Receiver | undefined;
            if (receiver === undefined) {
              orb.#receiver = createReceiver(orb);
            } else {
              if (receiver.#transmitOrb === orb) {
                throw new Error("Attempted to manage orb multiple times");
              }
              receiver.#transmitOrb = orb;
            }

            return () => {
              orb !== undefined && (disposeReceiver(orb), (orb = undefined));
            };
          }
          link(source: Orb) {
            (this.#orb.#receiver as Receiver).#staticLinkSource(source);
          }
          checkEmptyReceiver() {
            return this.#orb.#receiver === undefined;
          }
          transmit(): undefined {
            transmit(this.#orb);
          }
        }

        clean = () => {
          const first = dirtyReceiverPool;
          if (first === undefined) {
            return;
          }

          let receiver = first.#nextDirty;
          first.#nextDirty = undefined;

          if (receiver === first) {
            cleanReceiver(receiver);
            dirtyReceiverPool = undefined;
            return;
          }

          while (receiver !== undefined) {
            cleanReceiver(receiver);

            dirtyReceiverPool = receiver.#nextDirty;
            receiver.#nextDirty = undefined;
            receiver = dirtyReceiverPool;
          }
        };
      }
    }
    const disposedHandler = () => {};
    _EmitterChannel = class EmitterChannel {
      #queue: Subscription[] = [];
      #errorHandler: (cause: unknown) => void;
      constructor(errorHandler: (cause: unknown) => void) {
        this.#errorHandler = errorHandler;
      }
      subscribe(emittable: Emittable, handler: () => void): Disposer {
        const emitter = emittable[ORB];
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
      static #disposer(this: Orb, sub: Subscription): undefined {
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
  }
}

export const PropagationChannel = new _EmitterChannel(() => {});

export type OrbController = InstanceType<typeof OrbController>;
export const OrbController = _OrbController;

export type OrbStaticController = InstanceType<typeof OrbStaticController>;
export const OrbStaticController = _OrbStaticController;

export type EmitterChannel = InstanceType<typeof EmitterChannel>;
export const EmitterChannel = _EmitterChannel;
