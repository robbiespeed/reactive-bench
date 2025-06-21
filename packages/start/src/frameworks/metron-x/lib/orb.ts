import { type ReadableFn, type Reader, type Disposer, NOOP } from "./shared.js";

interface IReceiver {
  deref(): Orb | undefined;
  tryDeref(): Orb;
  run<T>(fn: ReadableFn<T>): T;
  dispose(): undefined;
}

export interface TransmitterPackage {
  orb: Orb;
  transmit: () => undefined;
}

export let createTransmitterOrb: (
  intercept: () => boolean
) => TransmitterPackage;
export let createReceiverOrb: (intercept: () => boolean) => IReceiver;
export let createManagedReceiverOrb: (intercept: () => boolean) => IReceiver;

// interface TransceiverPackage extends ReceiverPackage, TransmitterPackage {}

export const ORB = Symbol();

// signed 31 bit int
const MAX_INT = 0x7fffffff;

let isPropagating = false;

export let weaken: () => undefined;
export let recycleLinks: () => undefined;
let commit: (receiver: any) => undefined;
let checkVersion: (receiver: any, expectedVersion: number) => boolean;

export class Orb {
  #consumers: IReceiver[] = [];
  #consumerVersions: number[] = [];
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

    const stack: Orb[] = [];
    let versions = this.#consumerVersions;
    let consumers = this.#consumers;
    let i = consumers.length - 1;
    while (i >= 0) {
      const consumer = consumers[i]!;
      consumerHandler: if (checkVersion(consumer, versions[i]!)) {
        const consumerOrb = consumer.deref();

        if (consumerOrb === undefined) {
          break consumerHandler;
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
          if (shouldPropagate) {
            commit(consumer);
            const childConsumers = consumerOrb.#consumers;
            if (childConsumers.length !== 0) {
              if (i > 0) {
                stack.push(consumerOrb);
              } else {
                consumers = consumerOrb.#consumers;
                versions = consumerOrb.#consumerVersions;
                i = childConsumers.length - 1;
                continue;
              }
            }
          }
        }
      }

      i--;
      if (i < 0) {
        const nextNode = stack.pop();
        if (nextNode) {
          consumers = nextNode.#consumers;
          versions = nextNode.#consumerVersions;
          i = consumers.length - 1;
        }
      }
    }

    isPropagating = false;
  }
  static hold: (orb: Orb) => Disposer;
  static {
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

    let dirtyReceiverPool: Receiver | undefined;
    const weakenStack: Receiver[] = [];

    class Receiver implements IReceiver {
      #version = 0;
      /**
       * When value is `0` the orb is weakly held
       * Special case values:
       * - `-3` Disposed
       * - `-2` Uninitialized
       * - `-1` Managed
       */
      #hardRefCount = -3;
      #activeSourceCount = 0;
      #sources: Orb[] = [];
      #sourceSlots: number[] = [];
      #nextDirtyReceiver: Receiver | undefined;
      #weakOrb: WeakRef<Orb> | undefined;
      #orb: Orb | undefined;
      #linkSource(source: Orb): undefined {
        if (isPropagating) {
          throw new Error("Attempted read during propagation");
        }

        const sources = this.#sources;
        const existingIndex = sources.indexOf(source);
        if (existingIndex !== -1) {
          this.#activeSourceCount++;
          source.#consumerVersions[this.#sourceSlots[existingIndex]!] =
            this.#version;
          return;
        }

        const sourceReceiver = source.#receiver as Receiver | undefined;
        if (this.#hardRefCount !== 0 && sourceReceiver !== undefined) {
          switch (sourceReceiver.#hardRefCount) {
            case -3:
            case -1:
              break;
            case MAX_INT:
              throw new Error("Source has too many strong consumers");
            case -2:
              sourceReceiver.#hardRefCount = 1;
              sourceReceiver.#orb = source;
              break;
            case 0:
              sourceReceiver.#hardRefCount++;
              sourceReceiver.#orb = source;
              break;
            default:
              sourceReceiver.#hardRefCount++;
              break;
          }
        }

        this.#activeSourceCount++;
        const sourceConsumers = source.#consumers;
        const slot = sourceConsumers.length;
        sources.push(source);
        this.#sourceSlots.push(slot);
        sourceConsumers.push(this);
        source.#consumerVersions.push(this.#version);
      }
      #scheduleCleaning() {
        if (
          this.#activeSourceCount !== this.#sources.length &&
          this.#nextDirtyReceiver === undefined &&
          dirtyReceiverPool !== this
        ) {
          this.#nextDirtyReceiver = dirtyReceiverPool;
          dirtyReceiverPool = this;
        }
      }
      run<T>(fn: ReadableFn<T>): T {
        if (this.#hardRefCount < -1) {
          if (this.#orb === undefined) {
            throw new Error("Attempted to run disposed receiver");
          }
          this.#hardRefCount = 0;
          this.#weakOrb ??= new WeakRef(this.#orb);
          this.#orb = undefined;
        }

        const version = this.#version;
        const read: Reader = (readable) => {
          if (version !== this.#version) {
            throw new Error("Attempted to use expired read");
          }
          this.#linkSource(readable[ORB]);
          return readable.unwrap();
        };

        try {
          this.#activeSourceCount = 0;
          return fn(read);
        } finally {
          this.#scheduleCleaning();
        }
      }
      #makeSourcesStrong() {
        const stack: Receiver[] = [];
        let receiver: Receiver | undefined = this;

        stackLoop: do {
          const sources = receiver.#sources;
          const slots = receiver.#sourceSlots;
          const lastIndex = sources.length - 1;
          for (let i = 0; i <= lastIndex; i++) {
            const source = sources[i]!;
            const sourceReceiver = source.#receiver as Receiver | undefined;
            if (
              sourceReceiver === undefined ||
              source.#consumerVersions[slots[i]!]! !== receiver.#version ||
              sourceReceiver.#hardRefCount < 0
            ) {
              continue;
            }

            if (sourceReceiver.#hardRefCount++ === 0) {
              sourceReceiver.#orb = source;
              if (sourceReceiver.#sources.length !== 0) {
                if (i === lastIndex) {
                  receiver = sourceReceiver;
                  continue stackLoop;
                }
                stack.push(sourceReceiver);
              }
            }
          }
          receiver = stack.pop();
        } while (receiver !== undefined);
      }
      deref() {
        if (this.#hardRefCount === 0) {
          return this.#weakOrb!.deref();
        }
        return this.#orb as Orb | undefined;
      }
      tryDeref(): Orb {
        const orb =
          this.#hardRefCount === 0 ? this.#weakOrb!.deref() : this.#orb;
        if (orb === undefined) {
          throw new Error("Receiver is in a disposed state");
        }
        return orb;
      }
      dispose(): undefined {
        if (this.#hardRefCount !== -1) {
          if (this.#hardRefCount === -3) {
            return;
          }
          throw new Error("Attempted to dispose of non-disposable receiver");
        }

        this.#hardRefCount = -3;
        this.#orb!.#receiver = undefined;
        this.#orb = undefined;
        this.#version = -1;
        this.#activeSourceCount = 0;
        this.#nextDirtyReceiver = dirtyReceiverPool;
        dirtyReceiverPool = this;
        weakenStack.push(this);
      }
      static {
        class OrbController {
          // #orb!: Orb;
          receive(
            fn: (link: (orb: Orb) => undefined) => undefined
          ): undefined {}
          transmit(): boolean {
            return true;
          }
          hold(): Disposer {
            return NOOP;
          }
          dispose(): undefined {}
        }
        checkVersion = (receiver: Receiver, expectedVersion) =>
          receiver.#version === expectedVersion;
        commit = (receiver: Receiver) => {
          if (receiver.#version === MAX_INT) {
            // Should be able to recover here if version rolls to 0
            // and this set of recycling happens immediately rather than adding to disposedLinkPool
            throw new Error("TODO");
          }
          receiver.#version++;
        };
        Orb.hold = (orb) => {
          const receiver = orb.#receiver as unknown as Receiver | undefined;
          if (receiver === undefined) {
            // // Holding transmit only orbs in a global private bucket until release
            // // may actually be beneficial as it can help reduce GC pressure.
            // // A user might reasonably expect this to be the case,
            // // and be surprised if a held orb was GCed.

            // const holdCount = heldTransmitters.get(orb) ?? 0;
            // heldTransmitters.set(orb, holdCount + 1);

            // return () => {
            //   if (isDisposed) {
            //     return;
            //   }
            //   const currentHoldCount = heldTransmitters.get(orb) ?? 0;
            //   if (currentHoldCount === 1) {
            //     heldTransmitters.delete(orb);
            //   } else {
            //     heldTransmitters.set(orb, currentHoldCount + 1);
            //   }
            // };
            return NOOP;
          }

          switch (receiver.#hardRefCount) {
            case -3:
            case -1:
              return NOOP;
            case -2:
              receiver.#hardRefCount = 1;
              receiver.#orb = orb;
              break;
            case 0:
              receiver.#hardRefCount = 1;
              receiver.#orb = orb;
              if (receiver.#sources.length !== 0) {
                receiver.#makeSourcesStrong();
              }
              break;
            default:
              receiver.#hardRefCount++;
              break;
          }

          let isDisposed = false;
          return () => {
            if (isDisposed) {
              return;
            }
            isDisposed = true;
            if (receiver.#hardRefCount-- === 1) {
              receiver.#weakOrb ??= new WeakRef(receiver.#orb as Orb);
              receiver.#orb = undefined;
              weakenStack.push(receiver);
            }
          };
        };
        weaken = () => {
          let receiver = weakenStack.pop();
          stackLoop: while (receiver !== undefined) {
            if (receiver.#hardRefCount > 0) {
              continue;
            }
            const sources = receiver.#sources;
            const slots = receiver.#sourceSlots;
            const lastIndex = sources.length - 1;
            for (let i = 0; i <= lastIndex; i++) {
              const source = sources[i]!;
              const sourceReceiver = source.#receiver as Receiver | undefined;
              if (
                sourceReceiver === undefined ||
                source.#consumerVersions[slots[i]!]! !== receiver.#version ||
                sourceReceiver.#hardRefCount < 0
              ) {
                continue;
              }

              if (sourceReceiver.#hardRefCount-- === 1) {
                // Newly weak orbs get pushed to the local stack so their sources can have ref count reduced
                sourceReceiver.#weakOrb ??= new WeakRef(
                  sourceReceiver.#orb as Orb
                );
                sourceReceiver.#orb = undefined;
                if (sourceReceiver.#sources.length !== 0) {
                  if (i === lastIndex) {
                    receiver = sourceReceiver;
                    continue stackLoop;
                  }
                  weakenStack.push(sourceReceiver);
                }
              }
            }
            receiver = weakenStack.pop();
          }
        };
        recycleLinks = () => {
          while (dirtyReceiverPool !== undefined) {
            const receiver = dirtyReceiverPool;
            const sources = receiver.#sources;
            const count = sources.length;
            if (count === receiver.#activeSourceCount) {
              dirtyReceiverPool = receiver.#nextDirtyReceiver;
              receiver.#nextDirtyReceiver = undefined;
              continue;
            }
            const slots = receiver.#sourceSlots;
            let activeCount = 0;

            for (let i = 0; i < count; i++) {
              const slot = slots[i]!;
              const source = sources[i]!;
              if (source.#consumerVersions[slot]! === receiver.#version) {
                slots[activeCount] = slot;
                sources[activeCount++] = source;
                continue;
              }

              const sourceReceiver = source.#receiver as Receiver | undefined;
              if (
                sourceReceiver !== undefined &&
                sourceReceiver.#hardRefCount === 1
              ) {
                sourceReceiver.#hardRefCount--;
                sourceReceiver.#weakOrb ??= new WeakRef(
                  sourceReceiver.#orb as Orb
                );
                sourceReceiver.#orb = undefined;
                weakenStack.push(sourceReceiver);
              }

              const sourceConsumers = source.#consumers;
              const sourceConsumerVersions = source.#consumerVersions;

              const lastSlot = sourceConsumers.length - 1;
              const swappedConsumer = sourceConsumers[lastSlot]! as Receiver;

              // swap last consumer to slot of removed consumer
              swappedConsumer.#sourceSlots[
                swappedConsumer.#sources.indexOf(source)
              ] = slot;

              sourceConsumers[slot] = swappedConsumer;
              sourceConsumerVersions[slot] = sourceConsumerVersions[lastSlot]!;

              sourceConsumers.pop();
              sourceConsumerVersions.pop();
            }
            sources.length = activeCount;
            slots.length = activeCount;
            dirtyReceiverPool = receiver.#nextDirtyReceiver;
            receiver.#nextDirtyReceiver = undefined;
          }
        };
        createReceiverOrb = function createReceiverOrb(
          intercept: () => boolean
        ): IReceiver {
          const orb = new Orb();
          orb.#intercept = intercept;
          const receiver = new Receiver();
          receiver.#hardRefCount = -2;
          receiver.#orb = orb;
          orb.#receiver = receiver;

          return receiver;
        };
        createManagedReceiverOrb = function createManagedReceiverOrb(
          intercept: () => boolean
        ): IReceiver {
          const orb = new Orb();
          orb.#intercept = intercept;
          const receiver = new Receiver();
          receiver.#hardRefCount = -1;
          receiver.#orb = orb;
          orb.#receiver = receiver;

          return receiver;
        };
      }
    }
  }
}
