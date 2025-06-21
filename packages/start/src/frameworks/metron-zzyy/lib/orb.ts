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

interface DirtyLink {
  version: number;
  consumer: unknown;
  source: undefined;
  nextSource: undefined;
  nextConsumer: DirtyLink | undefined;
  prevConsumer: DirtyLink;
}

export const ORB = Symbol();

const defaultIntercept = () => true;

// signed 31 bit int
const MAX_INT = 0x7fffffff;

let isPropagating = false;

export let clean: () => undefined;

// function bindRunOnce<T extends Function>(
//   fn: T,
//   thisParam: ThisParameterType<T>
// ): () => undefined {
//   return () => {
//     if (fn !== undefined) {
//       try {
//         return fn.call(thisParam);
//       } finally {
//         (fn as unknown) = undefined;
//         (thisParam as unknown) = undefined;
//       }
//     }
//   };
// }

let _OrbController;

export class Orb {
  #consumers: Link | undefined;
  #receiver: unknown;
  #intercept: () => boolean = defaultIntercept;
  static {
    let recycledLinkPool: RecycledLink | undefined;
    let dirtyReceiverPool: DirtyLink | undefined;

    class Receiver {
      #sources: Link | undefined;
      #sourcesTail: Link | undefined;
      #transmitOrb: WeakRef<Orb> | Orb | undefined;
      #dirtyLink: DirtyLink | undefined;
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
          this.#sources = undefined;
        } else {
          sourcesTail.nextSource = undefined;
        }
      }
      #scheduleCleaning() {
        if (this.#dirtyLink !== undefined) {
          // Already scheduled
          return;
        }
        const sourcesTail = this.#sourcesTail;
        if (
          (sourcesTail !== undefined
            ? sourcesTail.nextSource
            : this.#sources) !== undefined
        ) {
          let link: DirtyLink;
          if (recycledLinkPool === undefined) {
            link = {
              version: 0,
              source: undefined,
              consumer: this,
              nextSource: undefined,
              nextConsumer: undefined,
              prevConsumer: undefined as any,
            };
          } else {
            link = recycledLinkPool as any;
            recycledLinkPool = recycledLinkPool.nextSource;
            link.consumer = this;
            link.nextSource = undefined;
          }
          if (dirtyReceiverPool === undefined) {
            link.prevConsumer = link;
            dirtyReceiverPool = link;
          } else {
            link.prevConsumer = dirtyReceiverPool.prevConsumer!;
            link.prevConsumer.nextConsumer = link;
            dirtyReceiverPool.prevConsumer = link;
          }
          this.#dirtyLink = link;
        }
      }
      static {
        function recycleReceiverDirtyLink(link: DirtyLink) {
          const prevConsumer = link.prevConsumer;
          if (link === prevConsumer) {
            dirtyReceiverPool = undefined;
          } else {
            const nextConsumer = link.nextConsumer;
            if (nextConsumer === undefined) {
              dirtyReceiverPool!.prevConsumer = prevConsumer;
            } else {
              nextConsumer.prevConsumer = prevConsumer;
            }
            if (link === dirtyReceiverPool) {
              dirtyReceiverPool = nextConsumer;
            } else {
              prevConsumer.nextConsumer = nextConsumer;
            }
          }
          (link as unknown as RecycledLink).nextSource = recycledLinkPool;
          recycledLinkPool = link as unknown as RecycledLink;

          recycledLinkPool.consumer = undefined;
          recycledLinkPool.nextConsumer = undefined;
          recycledLinkPool.prevConsumer = undefined;
        }

        class OrbController {
          #orb: Orb = new Orb();
          static {
            _OrbController = this;
          }
          get orb() {
            return this.#orb;
          }
          #dispose(): undefined {
            const receiver = this.#orb.#receiver as Receiver | undefined;
            if (receiver === undefined) {
              return;
            }
            this.#orb.#receiver = undefined;
            receiver.#transmitOrb = undefined;
            receiver.#version = MAX_INT;
            receiver.#sourcesTail = undefined;
            if (receiver.#sources !== undefined) {
              receiver.#cleanTail();
              if (receiver.#dirtyLink !== undefined) {
                recycleReceiverDirtyLink(receiver.#dirtyLink);
                receiver.#dirtyLink = undefined;
              }
            }
            this.transmit();
          }
          manage(): Disposer {
            let receiver = this.#orb.#receiver as Receiver | undefined;
            if (receiver === undefined) {
              this.#orb.#receiver = new Receiver(this.#orb);
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
          setIntercept(intercept: () => boolean): undefined {
            this.#orb.#intercept = intercept;
          }
          receiveRaw<T>(fn: (link: (input: Orb) => undefined) => T): T {
            const receiver = (this.#orb.#receiver ??= new Receiver(
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
            const receiver = (this.#orb.#receiver ??= new Receiver(
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
            if (!this.#orb.#intercept()) {
              return;
            }
            let prevIsPropagating = isPropagating;
            isPropagating = true;

            const stack: Link[] = [];
            let shouldPropagate;
            let link = this.#orb.#consumers;
            let consumer: Receiver;
            let nextConsumerLink: Link | undefined;

            while (link !== undefined) {
              consumer = link.consumer as Receiver;
              nextConsumerLink = link.nextConsumer;
              consumerHandler: if (consumer.#version === link.version) {
                let consumerOrb = consumer.#transmitOrb;
                if (consumerOrb === undefined) {
                  break consumerHandler;
                }
                if ("deref" in consumerOrb) {
                  consumerOrb = consumerOrb.deref();
                  if (consumerOrb === undefined) {
                    consumer.#version = MAX_INT;
                    consumer.#transmitOrb = undefined;
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
                  if (consumer.#version !== -1) {
                    consumer.#sourcesTail = undefined;
                    if (++consumer.#version === MAX_INT) {
                      if (consumer.#transmitOrb !== undefined) {
                        const freshReceiver = new Receiver(
                          consumer.#transmitOrb
                        );
                        freshReceiver.#sources = consumer.#sources;
                        consumerOrb.#receiver = freshReceiver;
                      }
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
              } else {
                consumer.#scheduleCleaning();
              }

              link = nextConsumerLink ?? stack.pop();
            }

            isPropagating = prevIsPropagating;
          }
        }
        clean = () => {
          let link = dirtyReceiverPool;
          while (link !== undefined) {
            (link.consumer as Receiver).#cleanTail();

            dirtyReceiverPool = link.nextConsumer;

            (link as unknown as RecycledLink).nextSource = recycledLinkPool;
            recycledLinkPool = link as unknown as RecycledLink;

            recycledLinkPool.consumer = undefined;
            recycledLinkPool.nextConsumer = undefined;
            recycledLinkPool.prevConsumer = undefined;

            link = dirtyReceiverPool === link ? undefined : dirtyReceiverPool;
          }
        };
      }
    }
  }
}

export type OrbController = InstanceType<typeof OrbController>;
export const OrbController = _OrbController;
