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

export const ORB = Symbol();

const defaultIntercept = () => true;

// signed 31 bit int
const MAX_INT = 0x7fffffff;

const MAX_VERSION = 0x7ffffffe;
const MAX_RECYCLE_VERSION = 0x7ffffff0;

let isPropagating = false;

export let clean: () => undefined;

let _OrbController;
let _OrbStaticController;

export class Orb {
  #consumers: Link | undefined;
  #receiver: unknown;
  #intercept: () => boolean = defaultIntercept;
  static {
    let recycledLinkPool: RecycledLink | undefined;
    let dirtyReceiverPool: Receiver | undefined;

    class Receiver {
      #sources: Link | undefined;
      #sourcesTail: Link | undefined;
      #transmitOrb: WeakRef<Orb> | Orb | undefined;
      #nextDirty: Receiver | undefined;
      #version = 0;
      constructor(orb: WeakRef<Orb> | Orb) {
        this.#transmitOrb = orb;
      }
      #linkSource(source: Orb): undefined {
        if (isPropagating) {
          throw new Error("Attempted read during propagation");
        }

        const tail = this.#sourcesTail;
        let nextOld: Link | undefined;
        if (tail !== undefined) {
          if (tail.source === source) {
            return;
          }
          nextOld = tail.nextSource;
        } else {
          nextOld = this.#sources;
        }

        if (nextOld !== undefined && nextOld.source === source) {
          nextOld.version = this.#version;
          nextOld.consumer = this;
          this.#sourcesTail = nextOld;
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

        const sourceConsumers = source.#consumers;
        if (sourceConsumers === undefined) {
          link.prevConsumer = link;
          source.#consumers = link;
        } else {
          const oldConsumerTail = sourceConsumers.prevConsumer!;
          sourceConsumers.prevConsumer = link;
          link.prevConsumer = oldConsumerTail;
          oldConsumerTail.nextConsumer = link;
        }

        if (tail === undefined) {
          this.#sources = link;
        } else {
          tail.nextSource = link;
        }
        this.#sourcesTail = link;
      }
      #staticLinkSource(source: Orb): undefined {
        if (isPropagating) {
          throw new Error("Attempted read during propagation");
        }

        const tail = this.#sourcesTail;
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

        const sourceConsumers = source.#consumers;
        if (sourceConsumers === undefined) {
          link.prevConsumer = link;
          source.#consumers = link;
        } else {
          const oldConsumerTail = sourceConsumers.prevConsumer!;
          sourceConsumers.prevConsumer = link;
          link.prevConsumer = oldConsumerTail;
          oldConsumerTail.nextConsumer = link;
        }

        if (tail === undefined) {
          this.#sources = link;
        } else {
          tail.nextSource = link;
        }
        this.#sourcesTail = link;
      }
      #scheduleCleaning() {
        if (this.#nextDirty !== undefined) {
          // Already scheduled
          return;
        }
        const sourcesTail = this.#sourcesTail;
        if (
          (sourcesTail !== undefined
            ? sourcesTail.nextSource
            : this.#sources) !== undefined
        ) {
          this.#nextDirty = dirtyReceiverPool ?? this;
          dirtyReceiverPool = this;
        }
      }
      static {
        let recycledReceiverPool: Receiver | undefined;

        function cleanReceiver(receiver: Receiver): undefined {
          const sourcesTail = receiver.#sourcesTail;
          let link =
            sourcesTail !== undefined
              ? sourcesTail.nextSource
              : receiver.#sources;
          while (link !== undefined) {
            const source = link.source;
            const prevConsumer = link.prevConsumer;
            if (prevConsumer === link) {
              source.#consumers = undefined;
            } else {
              const nextConsumer = link.nextConsumer;
              if (nextConsumer === undefined) {
                source.#consumers!.prevConsumer = prevConsumer;
              } else {
                nextConsumer.prevConsumer = prevConsumer;
              }
              if (link === source.#consumers) {
                source.#consumers = nextConsumer;
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
            receiver.#sources = undefined;
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
          if (!orb.#intercept()) {
            return;
          }
          let prevIsPropagating = isPropagating;
          isPropagating = true;

          const stack: Link[] = [];
          let shouldPropagate;
          let link = orb.#consumers;
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
                  consumer.#sourcesTail = undefined;
                  consumer.#scheduleCleaning();
                  break consumerHandler;
                }
              }

              try {
                shouldPropagate = consumerOrb.#intercept();
              } catch {
                // TODO report cause to global handler
                // default to 'uncaughtInterceptError' event where global event target is available)
                shouldPropagate = false;
              }
              if (shouldPropagate) {
                if (linkVersion !== MAX_INT) {
                  consumer.#sourcesTail = undefined;
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
                const childLinks = consumerOrb.#consumers;
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

          isPropagating = prevIsPropagating;
        }

        function disposeReceiver(orb: Orb) {
          const receiver = orb.#receiver as Receiver | undefined;
          if (receiver === undefined) {
            return;
          }
          orb.#receiver = undefined;
          receiver.#version++;
          receiver.#transmitOrb = undefined;
          receiver.#sourcesTail = undefined;
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
          setIntercept(intercept: () => boolean): undefined {
            this.#orb.#intercept = intercept;
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
          setIntercept(intercept: () => boolean): undefined {
            this.#orb.#intercept = intercept;
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
  }
}

export type OrbController = InstanceType<typeof OrbController>;
export const OrbController = _OrbController;

export type OrbStaticController = InstanceType<typeof OrbStaticController>;
export const OrbStaticController = _OrbStaticController;
