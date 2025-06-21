import { type ReadableFn, type Reader } from "./shared.js";

export interface IOrbController {
  receive<T>(fn: (link: (orb: Orb) => undefined) => T): T;
  transmit(): boolean;
  setIntercept(intercept: () => boolean): undefined;
}

export const ORB = Symbol();

const defaultIntercept = () => true;

// signed 31 bit int
const MAX_INT = 0x7fffffff;

let isPropagating = false;

export let recycleLinks: () => undefined;

let createController: (orb: Orb) => IOrbController;

export class Orb {
  #consumers: unknown[] = [];
  #consumerVersions: number[] = [];
  #intercept: () => boolean = defaultIntercept;
  constructor(hook: (controller: IOrbController) => undefined) {
    hook(createController(this));
  }
  static {
    let dirtyReceiverPool: Receiver | undefined;

    class Receiver {
      #version = 0;
      #activeSourceCount = 0;
      #sources: Orb[] = [];
      #sourceSlots: number[] = [];
      #nextDirtyReceiver: Receiver | undefined;
      #weakOrb: WeakRef<Orb>;
      constructor(weakOrb: WeakRef<Orb>) {
        this.#weakOrb = weakOrb;
      }
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
      static {
        class OrbController implements IOrbController {
          #orb!: Orb;
          #receiver: Receiver | undefined;
          static {
            createController = (orb) => {
              const c = new OrbController();
              c.#orb = orb;
              return c;
            };
          }
          setIntercept(intercept: () => boolean): undefined {
            this.#orb.#intercept = intercept;
          }
          receive<T>(fn: (link: (orb: Orb) => undefined) => T): T {
            const receiver = (this.#receiver ??= new Receiver(
              new WeakRef(this.#orb)
            ));
            const version = receiver.#version;
            const link = (orb: Orb): undefined => {
              if (version !== receiver.#version) {
                throw new Error("Attempted to use expired read");
              }
              receiver.#linkSource(orb);
            };

            try {
              receiver.#activeSourceCount = 0;
              return fn(link);
            } finally {
              receiver.#scheduleCleaning();
            }
          }
          transmit(): boolean {
            if (isPropagating) {
              throw new Error("TODO");
            }
            if (this.#orb.#intercept()) {
              isPropagating = true;
            } else {
              return false;
            }

            const stack: Orb[] = [];
            let versions = this.#orb.#consumerVersions;
            let consumers = this.#orb.#consumers;
            let i = consumers.length - 1;
            while (i >= 0) {
              const consumer = consumers[i] as Receiver;
              consumerHandler: if (consumer.#version === versions[i]!) {
                const consumerOrb = consumer.#weakOrb.deref();

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
                    if (consumer.#version === MAX_INT) {
                      // Should be able to recover here if version rolls to 0
                      // and this set of recycling happens immediately rather than adding to disposedLinkPool
                      throw new Error("TODO");
                    } else {
                      consumer.#version++;
                    }
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
            return true;
          }
        }
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
      }
    }
  }
}
