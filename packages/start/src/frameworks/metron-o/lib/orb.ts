import type { Disposer } from "#lib/frameworks/metron-o/lib/shared";
import type { ReadableFn, Reader } from "#lib/frameworks/metron-o/lib/shared";

interface IReceiver {
  deref(): Orb | undefined;
  run<T>(orb: Orb, fn: ReadableFn<T>): T;
}

interface Link {
  version: number;
  consumer: IReceiver;
  source: Orb;
  nextSource: Link | undefined;
  nextConsumer: Link | undefined;
  prevConsumer: Link | undefined;
}

interface RecycledLink {
  version: number;
  consumer: IReceiver | undefined;
  source: Orb | undefined;
  nextSource: RecycledLink | undefined;
  nextConsumer: Link | undefined;
  prevConsumer: Link | undefined;
}

export interface TransmitterPackage {
  orb: Orb;
  transmit: () => undefined;
}

export interface ReceiverPackage {
  orb: Orb;
  run: <T>(fn: ReadableFn<T>) => T;
}

export let createTransmitterOrb: (
  intercept: () => boolean
) => TransmitterPackage;
export let createReceiverOrb: (intercept: () => boolean) => ReceiverPackage;

// interface TransceiverPackage extends ReceiverPackage, TransmitterPackage {}

export const ORB = Symbol();

// signed 31 bit int
const MAX_INT = 0x7fffffff;

let isPropagating = false;

export let weaken: () => undefined;
export let recycleLinks: () => undefined;
let commit: (receiver: any) => undefined;
let checkVersion: (link: Link) => boolean;

export class Orb {
  #consumers: Link | undefined;
  #intercept!: () => boolean;
  #receiver: undefined | IReceiver;
  // Depth first propagation
  #transmit(): undefined {
    if (isPropagating) {
      throw new Error("TODO");
    }
    if (this.#intercept()) {
      isPropagating = true;
    } else {
      return;
    }

    let link = this.#consumers;
    let stack: Link[] = [];

    while (link !== undefined) {
      const consumer = link.consumer;
      const nextConsumer = link.nextConsumer;
      if (checkVersion(link)) {
        const consumerTransmitter = consumer.deref();

        if (consumerTransmitter === undefined) {
          // TODO free receiver and all it's links since it can no longer propagate
          link = nextConsumer ?? stack.pop();
          continue;
        }
        let shouldPropagate;
        try {
          shouldPropagate = consumerTransmitter.#intercept();
        } catch {
          // TODO report cause to global handler
          // default to 'uncaughtInterceptError' event where global event target is available)
          shouldPropagate = false;
        }
        if (shouldPropagate) {
          commit(consumer);
          const childLinks = consumerTransmitter.#consumers;
          if (childLinks !== undefined) {
            if (nextConsumer !== undefined) {
              stack.push(nextConsumer);
            }

            link = childLinks;
            continue;
          }
        }
      }
      link = nextConsumer ?? stack.pop();
    }
    isPropagating = false;
  }
  static hold: (orb: Orb) => Disposer;
  static {
    // class OrbTransmitController {
    //   #orb: Orb;
    //   constructor (intercept: () => boolean) {
    //     const orb = new Orb();
    //     orb.#intercept = intercept;
    //     this.#orb = orb;
    //   }
    //   transmit () {
    //     this.#orb.#transmit();
    //   }
    //   get orb () {
    //     return this.#orb;
    //   }
    // }
    // class OrbReceiveController {
    //   #orb: Orb;
    //   constructor (intercept: () => boolean) {
    //     const orb = new Orb();
    //     orb.#intercept = intercept;
    //     const receiver = new Receiver();
    //     orb.#receiver = receiver;
    //     this.#orb = orb;
    //   }
    //   startRead() {
    //     // return this.#orb.#receiver.startRead();
    //   }
    //   get orb () {
    //     return this.#orb;
    //   }
    // }
    createTransmitterOrb = function createTransmitterOrb(
      intercept: () => boolean
    ): TransmitterPackage {
      const orb = new Orb();
      orb.#intercept = intercept;
      return {
        orb,
        transmit: orb.#transmit.bind(orb),
      };
    };
    createReceiverOrb = function createReceiverOrb(
      intercept: () => boolean
    ): ReceiverPackage {
      const orb = new Orb();
      orb.#intercept = intercept;
      const receiver = new Receiver();
      orb.#receiver = receiver;

      return {
        orb,
        run: receiver.run.bind(receiver, orb) as ReceiverPackage["run"],
      };
    };

    const MAX_OLD_DEEP_CHECK = 3;

    let recycledLinkPool: RecycledLink | undefined = undefined;
    // let disposedLinkPool: Link | undefined = undefined;
    // let disposedLinkPoolTail: Link | undefined = undefined;
    let dirtyReceiverPool: Receiver | undefined;
    // const receiverCleanupStack: Receiver[] = [];
    let weakenStack: WeakRef<Orb>[] = [];

    class Receiver implements IReceiver {
      #version = 0;
      #refState = 1;
      #sources: Link | undefined;
      #sourcesTail: Link | undefined;
      #nextDirtyReceiver: Receiver | undefined;
      #weakOrb: WeakRef<Orb> | undefined;
      #orb: Orb | undefined;
      #linkSource(source: Orb): undefined {
        if (isPropagating) {
          throw new Error("Attempted read during propagation");
        }
        const tail = this.#sourcesTail;
        if (tail?.source === source) {
          return;
        }

        const nextOld = tail === undefined ? this.#sources : tail.nextSource;

        if (nextOld?.source === source) {
          nextOld.version = this.#version;
          this.#sourcesTail = nextOld;
          return;
        }

        // if (nextOld !== undefined) {
        //   if (nextOld.source === source) {
        //     nextOld.version = this.#version;
        //     this.#sourcesTail = nextOld;
        //     return;
        //   }

        //   let deepNextOld = nextOld.nextSource;
        //   if (deepNextOld !== undefined) {
        //     let previousOld = nextOld;
        //     let depth = 0;
        //     let nextNextOld: Link | undefined;
        //     while (depth < MAX_OLD_DEEP_CHECK) {
        //       nextNextOld = deepNextOld.nextSource;
        //       if (deepNextOld.source === source) {
        //         deepNextOld.version = this.#version;
        //         deepNextOld.nextSource = nextOld;
        //         if (tail === undefined) {
        //           this.#sources = deepNextOld;
        //         } else {
        //           tail.nextSource = deepNextOld;
        //         }
        //         this.#sourcesTail = deepNextOld;
        //         previousOld.nextSource = nextNextOld;
        //         return;
        //       }

        //       previousOld = deepNextOld;
        //       if (nextNextOld === undefined) {
        //         deepNextOld = nextNextOld;
        //         break;
        //       }
        //       depth++;
        //     }
        //   }
        // }

        const sourceReceiver = source.#receiver as Receiver | undefined;
        if (sourceReceiver !== undefined) {
          // TODO bench switch OR first check is > 2
          if (sourceReceiver.#refState === 1) {
            sourceReceiver.#refState = 2;
            sourceReceiver.#weakOrb ??= new WeakRef(source);
            sourceReceiver.#orb = undefined;
          } else if (sourceReceiver.#refState === 2) {
            sourceReceiver.#orb = source;
            sourceReceiver.#refState = 3;
          } else if (sourceReceiver.#refState === MAX_INT) {
            throw new Error("Source has too many strong consumers");
          } else {
            sourceReceiver.#refState++;
          }
        }

        let link: Link;
        if (recycledLinkPool === undefined) {
          link = {
            version: (this as Receiver).#version,
            source,
            consumer: this,
            nextSource: nextOld,
            nextConsumer: undefined,
            prevConsumer: undefined,
          };
        } else {
          link = recycledLinkPool as unknown as Link;
          recycledLinkPool = link.nextSource;
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
      #scheduleCleaning() {
        if (
          this.#nextDirtyReceiver !== undefined ||
          dirtyReceiverPool === this
        ) {
          // Already scheduled
          return;
        }
        const sourcesTail = this.#sourcesTail;
        const oldLinkStart =
          sourcesTail !== undefined ? sourcesTail.nextSource : this.#sources;
        if (oldLinkStart !== undefined) {
          this.#nextDirtyReceiver = dirtyReceiverPool;
          dirtyReceiverPool = this;
        }
      }
      run<T>(orb: Orb, fn: ReadableFn<T>): T {
        const version = this.#version;
        const read: Reader = (readable) => {
          if (version !== this.#version) {
            throw new Error("Attempted to use expired read");
          }
          if (ORB in readable) {
            this.#linkSource(readable[ORB]);
            return readable.unwrap();
          }
          return readable(read);
        };
        if (this.#refState === 1) {
          if (orb.#receiver !== this) {
            throw new Error(
              "Attempted to initialize receiver with non-owner orb"
            );
          }
          this.#refState = 2;
          this.#weakOrb ??= new WeakRef(orb);
        }

        try {
          this.#sourcesTail = undefined;
          return fn(read);
        } finally {
          this.#scheduleCleaning();
        }
      }
      #makeSourcesStrong() {
        const stack: Link[] = [];
        let link = this.#sources;
        while (link !== undefined) {
          const nextSourceLink = link.nextSource;
          const { source } = link;
          const sourceReceiver = source.#receiver as Receiver | undefined;
          if (sourceReceiver === undefined) {
            link = nextSourceLink;
            continue;
          }

          sourceReceiver.#refState++;
          if (sourceReceiver.#refState === 3) {
            sourceReceiver.#orb = source;
            const sourceSources = sourceReceiver.#sources;
            if (sourceSources !== undefined) {
              if (nextSourceLink === undefined) {
                link = sourceSources;
                continue;
              }
              stack.push(sourceSources);
            }
          }
          link = nextSourceLink ?? stack.pop();
        }
      }
      deref() {
        if (this.#refState === 2) {
          return this.#weakOrb!.deref();
        }
        return this.#orb;
      }
      static {
        checkVersion = (link: Link) =>
          (link.consumer as Receiver).#version === link.version;
        commit = (receiver: Receiver) => {
          if (receiver.#version === MAX_INT) {
            // Should be able to recover here if version rolls to 0
            // and this set of recycling happens immediately rather than adding to disposedLinkPool
            throw new Error("TODO");
          }
          receiver.#version++;
        };
        const heldTransmitters = new Map<Orb, number>();
        Orb.hold = (orb) => {
          const receiver = orb.#receiver as unknown as Receiver | undefined;
          let isDisposed = false;

          if (receiver === undefined) {
            // Holding transmit only orbs in a global private bucket until release
            // may actually be beneficial as it can help reduce GC pressure.
            // A user might reasonably expect this to be the case,
            // and be surprised if a held orb was GCed.

            const holdCount = heldTransmitters.get(orb) ?? 0;
            heldTransmitters.set(orb, holdCount + 1);

            return () => {
              if (isDisposed) {
                return;
              }
              const currentHoldCount = heldTransmitters.get(orb) ?? 0;
              if (currentHoldCount === 1) {
                heldTransmitters.delete(orb);
              } else {
                heldTransmitters.set(orb, currentHoldCount + 1);
              }
            };
          }

          if (receiver.#refState === 1) {
            receiver.#refState = 3;
            receiver.#orb = orb;
          } else {
            receiver.#refState++;
            if (receiver.#refState === 3) {
              receiver.#orb = orb;
              receiver.#makeSourcesStrong();
            }
          }

          return () => {
            if (isDisposed) {
              return;
            }
            isDisposed = true;
            receiver.#refState--;
            if (receiver.#refState === 2) {
              weakenStack.push(
                (receiver.#weakOrb ??= new WeakRef(receiver.#orb as Orb))
              );
              receiver.#orb = undefined;
            }
          };
        };
        weaken = () => {
          const stack: Orb[] = [];

          // First filter out any orbs in the weaken stack that were GCed
          for (let i = 0; i < weakenStack.length; i++) {
            const weakOrb = weakenStack[i]!;
            const orb = weakOrb.deref();
            if (orb !== undefined) {
              stack.push(orb);
            }
          }

          // Then execute the stack
          let orb = stack.pop();
          while (orb !== undefined) {
            let link = (orb.#receiver as Receiver).#sources;
            while (link !== undefined) {
              const sourceReceiver = link.source.#receiver as
                | Receiver
                | undefined;
              if (
                sourceReceiver !== undefined &&
                sourceReceiver.#refState > 2
              ) {
                sourceReceiver.#refState--;
                if (sourceReceiver.#refState === 2) {
                  // Newly weak orbs get pushed to the local stack so their sources can have ref count reduced
                  stack.push(sourceReceiver.#orb as Orb);
                  sourceReceiver.#weakOrb ??= new WeakRef(
                    sourceReceiver.#orb as Orb
                  );
                  sourceReceiver.#orb = undefined;
                }
              }
              link = link.nextSource;
            }
            orb = stack.pop();
          }
        };
        recycleLinks = () => {
          let receiver = dirtyReceiverPool;
          while (receiver !== undefined) {
            const sourcesTail = receiver.#sourcesTail;
            let link =
              sourcesTail !== undefined
                ? sourcesTail.nextSource
                : receiver.#sources;
            while (link !== undefined) {
              const source = link.source;

              const sourceReceiver = source.#receiver as Receiver | undefined;
              if (sourceReceiver !== undefined) {
                if (sourceReceiver.#refState > 3) {
                  sourceReceiver.#refState--;
                } else if (sourceReceiver.#refState === 2) {
                  sourceReceiver.#refState--;
                  weakenStack.push(
                    (sourceReceiver.#weakOrb ??= new WeakRef(
                      sourceReceiver.#orb as Orb
                    ))
                  );
                }
              }

              const nextConsumer = link.nextConsumer;
              const prevConsumer = link.prevConsumer;
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

              const nextLink = link.nextSource;
              (link as RecycledLink).nextSource = recycledLinkPool;
              recycledLinkPool = link;

              recycledLinkPool.consumer = undefined;
              recycledLinkPool.source = undefined;
              recycledLinkPool.nextConsumer = undefined;
              recycledLinkPool.prevConsumer = undefined;

              link = nextLink;
            }
            receiver = receiver.#nextDirtyReceiver;
          }
        };
        // recycleLinks = () => {
        //   let link = disposedLinkPool;

        //   while (link !== undefined) {
        //     const source = link.source;

        //     const sourceReceiver = source.#receiver as Receiver | undefined;
        //     if (sourceReceiver !== undefined && sourceReceiver.#refState > 2) {
        //       sourceReceiver.#refState--;
        //       if (sourceReceiver.#refState === 2) {
        //         weakenStack.push(
        //           (sourceReceiver.#weakOrb ??= new WeakRef(
        //             sourceReceiver.#orb as Orb
        //           ))
        //         );
        //       }
        //     }

        //     const nextConsumer = link.nextConsumer;
        //     const prevConsumer = link.prevConsumer;

        //     if (nextConsumer === undefined) {
        //       source.#consumers!.prevConsumer = prevConsumer;
        //     } else {
        //       nextConsumer.prevConsumer = prevConsumer;
        //     }
        //     if (prevConsumer === undefined) {
        //       source.#consumers = nextConsumer;
        //     } else {
        //       prevConsumer.nextConsumer = nextConsumer;
        //     }

        //     disposedLinkPool = link.nextSource;
        //     (link as RecycledLink).nextSource = recycledLinkPool;
        //     recycledLinkPool = link;

        //     recycledLinkPool.consumer = undefined;
        //     recycledLinkPool.source = undefined;
        //     recycledLinkPool.nextConsumer = undefined;
        //     recycledLinkPool.prevConsumer = undefined;

        //     link = disposedLinkPool;
        //   }

        //   disposedLinkPool = undefined;
        //   disposedLinkPoolTail = undefined;
        // };
      }
    }
  }
}
