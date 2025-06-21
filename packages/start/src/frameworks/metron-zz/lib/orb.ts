import { type ReadableFn, type Reader, type Disposer } from "./shared.js";

interface IReceiver {
  deref(): Orb | undefined;
  tryDeref(): Orb;
  run<T>(fn: ReadableFn<T>): T;
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

export let recycleLinks: () => undefined;
let commit: (receiver: any) => undefined;
let checkVersion: (receiver: any, expectedVersion: number) => boolean;

export class Orb {
  #consumers: IReceiver[] = [];
  #consumerVersions: number[] = [];
  #intercept!: () => boolean;
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
      #activeSourceCount = 0;
      #sources: Orb[] = [];
      #sourceSlots: number[] = [];
      #nextDirtyReceiver: Receiver | undefined;
      #weakOrb: WeakRef<Orb> | undefined;
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
      deref() {
        return this.#weakOrb!.deref();
      }
      tryDeref(): Orb {
        const orb = this.#weakOrb!.deref();
        if (orb === undefined) {
          throw new Error("Receiver is in a disposed state");
        }
        return orb;
      }
      static {
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
          receiver.#weakOrb = new WeakRef(orb);

          return receiver;
        };
      }
    }
  }
}
