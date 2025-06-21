import type { Disposer, Reader } from "./shared.js";

interface Link {
  version: number;
  consumer: unknown;
  source: Orb;
  nextSource: Link | undefined;
  nextConsumer: Link | undefined;
  prevConsumer: Link | undefined;
}

interface RecycledLink {
  version: number;
  consumer: unknown;
  source: Orb | undefined;
  nextSource: RecycledLink | undefined;
  nextConsumer: Link | undefined;
  prevConsumer: Link | undefined;
}

export const ORB = Symbol();

const defaultIntercept = () => true;

// signed 31 bit int
const MAX_INT = 0x7fffffff;

let isPropagating = false;

export let clean: () => undefined = () => {};

let _OrbController;

export class Orb {
  #consumers: Link | undefined;
  #receiver: unknown;
  #intercept: () => boolean = defaultIntercept;
  static {
    const recycledReceivers: Receiver[] = [];
    let recycledLinkPool: RecycledLink | undefined;

    class Receiver {
      #sources: Link | undefined;
      #sourcesTail: Link | undefined;
      #transmitOrb: WeakRef<Orb> | Orb | undefined;
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
            prevConsumer: undefined,
          };
        } else {
          link = recycledLinkPool as unknown as Link;
          recycledLinkPool = link.nextSource;
          link.version = this.#version;
          link.source = source;
          link.consumer = this;
          link.nextSource = nextOld;
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
      #cleanTail() {
        const sourcesTail = this.#sourcesTail;
        let link =
          sourcesTail !== undefined ? sourcesTail.nextSource : this.#sources;
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
            if (prevConsumer === undefined) {
              source.#consumers = nextConsumer;
            } else {
              prevConsumer.nextConsumer = nextConsumer;
            }
          }

          const nextLink = link.nextSource;
          (link as RecycledLink).nextSource = recycledLinkPool;
          recycledLinkPool = link;

          recycledLinkPool.consumer = undefined;
          recycledLinkPool.source = undefined;
          recycledLinkPool.nextConsumer = undefined;
          recycledLinkPool.prevConsumer = undefined;

          // link.consumer = undefined;
          // (link as any).source = undefined;
          // link.nextConsumer = undefined;
          // link.prevConsumer = undefined;

          link = nextLink;
        }

        if (sourcesTail === undefined) {
          this.#sources = undefined;
        } else {
          sourcesTail.nextSource = undefined;
        }
      }
      static {
        function createReceiver(orb: Orb | WeakRef<Orb>) {
          if (recycledReceivers.length === 0) {
            return new Receiver(orb);
          }
          const receiver = recycledReceivers.pop()!;
          receiver.#transmitOrb = orb;
          return receiver;
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
            let receiver = this.#orb.#receiver as Receiver | undefined;
            if (receiver === undefined) {
              this.#orb.#receiver = createReceiver(this.#orb);
            } else {
              if (receiver.#transmitOrb === this.#orb) {
                throw new Error("Attempted to manage orb multiple times");
              }
              receiver.#transmitOrb = this.#orb;
            }
            let ctx: this | undefined = this;
            return () => {
              ctx !== undefined && (ctx.#dispose(), (ctx = undefined));
            };
          }
          #dispose() {
            const receiver = this.#orb.#receiver as Receiver | undefined;
            if (receiver === undefined) {
              return;
            }
            this.#orb.#receiver = undefined;
            receiver.#version++;
            receiver.#transmitOrb = undefined;
            receiver.#sourcesTail = undefined;
            receiver.#cleanTail();
            recycledReceivers.push(receiver);
            this.transmit();
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

            try {
              return fn(link);
            } finally {
              receiver.#cleanTail();
            }
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

            try {
              return fn(read);
            } finally {
              receiver.#cleanTail();
            }
          }
          transmit(): undefined {
            if (!this.#orb.#intercept()) {
              return;
            }
            let prevIsPropagating = isPropagating;
            isPropagating = true;

            let link = this.#orb.#consumers;
            let stack: Link[] = [];

            while (link !== undefined) {
              const consumer = link.consumer as Receiver;
              const nextConsumerLink = link.nextConsumer;
              consumerHandler: if (consumer.#version === link.version) {
                let consumerOrb = consumer.#transmitOrb;
                if (consumerOrb === undefined) {
                  break consumerHandler;
                }
                if ("deref" in consumerOrb) {
                  consumerOrb = consumerOrb.deref();
                  if (consumerOrb === undefined) {
                    consumer.#transmitOrb = undefined;
                    consumer.#version++;
                    consumer.#sourcesTail = undefined;
                    consumer.#cleanTail();
                    recycledReceivers.push(consumer);
                    break consumerHandler;
                  }
                }

                let shouldPropagate;
                try {
                  shouldPropagate = consumerOrb.#intercept();
                } catch {
                  // TODO report cause to global handler
                  // default to 'uncaughtInterceptError' event where global event target is available)
                  shouldPropagate = false;
                }
                if (shouldPropagate) {
                  consumer.#sourcesTail = undefined;
                  if (++consumer.#version === MAX_INT) {
                    consumer.#transmitOrb = undefined;
                    consumerOrb.#receiver = undefined;
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
        }
      }
    }
  }
}

export type OrbController = InstanceType<typeof OrbController>;
export const OrbController = _OrbController;
