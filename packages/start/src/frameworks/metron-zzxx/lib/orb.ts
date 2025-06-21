import type { Reader } from "./shared.js";

export const ORB = Symbol();

const defaultIntercept = () => true;

// signed 31 bit int
const MAX_INT = 0x7fffffff;

let isPropagating = false;

export let recycleLinks: () => undefined;

let _OrbController;

export class Orb {
  #consumers: unknown[] = [];
  #consumerVersions: number[] = [];
  #intercept: () => boolean = defaultIntercept;
  #receiver: unknown;
  static {
    let dirtyReceiverPool: Receiver | undefined;

    class Receiver {
      #version = 0;
      #activeSourceCount = 0;
      #sources: Orb[] = [];
      #sourceSlots: number[] = [];
      #nextDirtyReceiver: Receiver | undefined;
      #transmitOrb: WeakRef<Orb> | Orb | undefined;
      constructor(orb: WeakRef<Orb> | Orb) {
        this.#transmitOrb = orb;
      }
      #linkSource(source: Orb): undefined {
        if (isPropagating) {
          throw new Error("Attempted read during propagation");
        }

        const sources = this.#sources;
        if (sources[this.#activeSourceCount] === source) {
          source.#consumerVersions[
            this.#sourceSlots[this.#activeSourceCount]!
          ] = this.#version;
          this.#activeSourceCount++;
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
      // #scheduleCleaning() {
      //   if (
      //     this.#activeSourceCount !== this.#sources.length &&
      //     this.#nextDirtyReceiver === undefined &&
      //     dirtyReceiverPool !== this
      //   ) {
      //     this.#nextDirtyReceiver = dirtyReceiverPool;
      //     dirtyReceiverPool = this;
      //   }
      // }
      static {
        class OrbController {
          #orb: Orb = new Orb();
          static {
            _OrbController = this;
          }
          get orb() {
            return this.#orb;
          }
          manage() {
            let receiver = this.#orb.#receiver as Receiver | undefined;
            if (receiver === undefined) {
              this.#orb.#receiver = new Receiver(this.#orb);
            } else {
              receiver.#transmitOrb = this.#orb;
            }
          }
          dispose() {
            const receiver = this.#orb.#receiver as Receiver | undefined;
            if (receiver === undefined) {
              return;
            }
            this.#orb.#receiver = undefined;
            receiver.#transmitOrb = undefined;
            receiver.#version = MAX_INT;
            receiver.#activeSourceCount = 0;
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

            // try {
            receiver.#activeSourceCount = 0;
            return fn(link);
            // } finally {
            //   receiver.#scheduleCleaning();
            // }
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

            // try {
            receiver.#activeSourceCount = 0;
            return fn(read);
            // } finally {
            //   receiver.#scheduleCleaning();
            // }
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
            let s = -1;
            let versions = this.#orb.#consumerVersions;
            let consumers = this.#orb.#consumers;
            let lastI = consumers.length - 1;
            let i = 0;
            do {
              const consumer = consumers[i] as Receiver;
              consumerHandler: if (consumer.#version === versions[i]!) {
                let consumerOrb = consumer.#transmitOrb;
                if (consumerOrb === undefined) {
                  break consumerHandler;
                }
                if ("deref" in consumerOrb) {
                  consumerOrb = consumerOrb.deref();
                  if (consumerOrb === undefined) {
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
                  if (consumer.#version === MAX_INT) {
                    // Should be able to recover here if version rolls to 0
                    // and this set of recycling happens immediately rather than adding to disposedLinkPool
                    throw new Error("TODO");
                  } else {
                    consumer.#version++;
                    consumer.#activeSourceCount = 0;
                  }
                  const childConsumers = consumerOrb.#consumers;
                  if (childConsumers.length !== 0) {
                    if (lastI === 0) {
                      consumers = childConsumers;
                      versions = consumerOrb.#consumerVersions;
                      lastI = consumers.length - 1;
                      i = 0;
                      continue;
                    }
                    stack.push(consumerOrb);
                  }
                }
              }

              if (i === lastI) {
                const nextNode = stack[++s];
                if (nextNode === undefined) {
                  break;
                }
                consumers = nextNode.#consumers;
                versions = nextNode.#consumerVersions;
                lastI = consumers.length - 1;
                i = 0;
                continue;
              }
              i++;
            } while (true);

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

export type OrbController = InstanceType<typeof OrbController>;
export const OrbController = _OrbController;
