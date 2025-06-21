// import type { Disposer, ReadableFn } from "#lib/frameworks/metron-o/lib/shared";
// import { NOOP, type Reader } from "#lib/frameworks/metron-o/lib/shared";

// interface IReceiver {
//   sources: Link | undefined;
//   sourcesTail: Link | undefined;
//   deref(): Orb | undefined;
//   hold(orb: Orb): Disposer;
//   reader?: Reader;
//   startRead(): Reader;
//   commit(orb: Orb): undefined;
// }

// interface Link {
//   consumer: IReceiver;
//   source: Orb;
//   nextSource: Link | undefined;
//   nextConsumer: Link | undefined;
//   prevConsumer: Link | undefined;
// }

// interface RecycledLink {
//   consumer: IReceiver | undefined;
//   source: Orb | undefined;
//   nextSource: Link | undefined;
//   nextConsumer: Link | undefined;
//   prevConsumer: Link | undefined;
// }

// export interface TransmitterPackage {
//   orb: Orb;
//   transmit: () => undefined;
// }

// export interface ReceiverPackage {
//   orb: Orb;
//   startRead: () => Reader;
//   stopRead: () => undefined;
// }

// export let createTransmitterOrb: (
//   intercept: () => boolean
// ) => TransmitterPackage;
// export let createReceiverOrb: (intercept: () => boolean) => ReceiverPackage;

// // interface TransceiverPackage extends ReceiverPackage, TransmitterPackage {}

// let poolLink: RecycledLink | undefined = undefined;

// function getLink(source: Orb, consumer: IReceiver): Link {
//   if (poolLink) {
//     const link = poolLink as unknown as Link;
//     poolLink = link.nextSource;
//     link.nextSource = undefined;
//     link.consumer = consumer;
//     link.source = source;
//     return link as Link;
//   } else {
//     return {
//       consumer,
//       source,
//       nextConsumer: undefined,
//       nextSource: undefined,
//       prevConsumer: undefined,
//     };
//   }
// }

// function recycleLink(link: RecycledLink) {
//   link.consumer = undefined;
//   link.source = undefined;
//   link.nextConsumer = undefined;
//   link.nextSource = undefined;
//   link.prevConsumer = undefined;
//   poolLink = link;
// }

// export const ORB = Symbol();

// // signed 31 bit int
// const MAX_INT = 0x7fffffff;

// let isPropagating = false;

// export class Orb {
//   #consumers: Link | undefined;
//   #intercept!: () => boolean;
//   #receiver: undefined | IReceiver;
//   // Depth first propagation
//   #transmit(): undefined {
//     if (isPropagating) {
//       throw new Error("TODO");
//     }
//     if (this.#intercept()) {
//       isPropagating = true;
//     } else {
//       return;
//     }

//     let link = this.#consumers;
//     let stack: Link[] = [];

//     while (link !== undefined) {
//       const consumer = link.consumer;
//       const nextConsumer = link.nextConsumer;
//       if (consumer.sourcesTail !== undefined) {
//         const consumerTransmitter = consumer.deref();

//         if (consumerTransmitter === undefined) {
//           const prevConsumer = link.prevConsumer;

//           if (prevConsumer === undefined) {
//             link.source.#consumers = nextConsumer;
//           } else {
//             if (nextConsumer !== undefined) {
//               nextConsumer.prevConsumer = prevConsumer;
//             }
//             prevConsumer.nextConsumer = nextConsumer;
//           }

//           // TODO free receiver since it can no longer propagate

//           recycleLink(link);

//           link = nextConsumer ?? stack.pop();
//           continue;
//         }
//         let shouldPropagate;
//         try {
//           shouldPropagate = consumerTransmitter.#intercept();
//         } catch {
//           // TODO report cause
//           shouldPropagate = false;
//         }
//         if (shouldPropagate) {
//           consumer.sourcesTail = undefined;
//           // Clear any sources and end read if propagating mid read
//           if (consumer.reader !== undefined) {
//             consumer.commit(consumerTransmitter);
//           }
//           const childLinks = consumerTransmitter.#consumers;
//           if (childLinks !== undefined) {
//             if (nextConsumer !== undefined) {
//               stack.push(nextConsumer);
//             }

//             link = childLinks;
//             continue;
//           }
//         }
//       }
//       link = nextConsumer ?? stack.pop();
//     }
//     isPropagating = false;
//   }
//   hold() {
//     return this.#receiver?.hold(this) ?? NOOP;
//   }
//   static {
//     // class OrbTransmitController {
//     //   #orb: Orb;
//     //   constructor (intercept: () => boolean) {
//     //     const orb = new Orb();
//     //     orb.#intercept = intercept;
//     //     this.#orb = orb;
//     //   }
//     //   transmit () {
//     //     this.#orb.#transmit();
//     //   }
//     //   get orb () {
//     //     return this.#orb;
//     //   }
//     // }
//     // class OrbReceiveController {
//     //   #orb: Orb;
//     //   constructor (intercept: () => boolean) {
//     //     const orb = new Orb();
//     //     orb.#intercept = intercept;
//     //     const receiver = new Receiver();
//     //     orb.#receiver = receiver;
//     //     this.#orb = orb;
//     //   }
//     //   startRead() {
//     //     // return this.#orb.#receiver.startRead();
//     //   }
//     //   get orb () {
//     //     return this.#orb;
//     //   }
//     // }
//     createTransmitterOrb = function createTransmitterOrb(
//       intercept: () => boolean
//     ): TransmitterPackage {
//       const orb = new Orb();
//       orb.#intercept = intercept;
//       return {
//         orb,
//         transmit: orb.#transmit.bind(orb),
//       };
//     };
//     createReceiverOrb = function createReceiverOrb(
//       intercept: () => boolean
//     ): ReceiverPackage {
//       const orb = new Orb();
//       orb.#intercept = intercept;
//       const receiver = new Receiver();
//       orb.#receiver = receiver;

//       return {
//         orb,
//         startRead: receiver.startRead.bind(receiver),
//         stopRead: receiver.commit.bind(receiver, orb),
//       };
//     };

//     class Receiver implements IReceiver {
//       #refState = 1;
//       reader?: Reader;
//       sources: Link | undefined;
//       sourcesTail: Link | undefined;
//       #weakAtom: WeakRef<Orb> | undefined;
//       #orb: Orb | WeakRef<Orb> | undefined;
//       #linkSource(source: Orb): undefined {
//         if (isPropagating) {
//           throw new Error("TODO MESSAGE");
//         }

//         const tail = this.sourcesTail;
//         const nextOld = tail === undefined ? this.sources : tail.nextSource;

//         if (nextOld?.source === source) {
//           this.sourcesTail = nextOld;
//           return;
//         }
//         if (tail?.source === source) {
//           return;
//         }

//         const link = getLink(source, this);
//         link.nextSource = nextOld;
//         if (tail === undefined) {
//           this.sources = link;
//         } else {
//           tail.nextSource = link;
//         }

//         const sourceConsumers = source.#consumers;

//         if (sourceConsumers === undefined) {
//           link.prevConsumer = link;
//           source.#consumers = link;
//         } else {
//           const oldConsumerTail = sourceConsumers.prevConsumer!;
//           sourceConsumers.prevConsumer = link;
//           link.prevConsumer = oldConsumerTail;
//           oldConsumerTail.nextConsumer = link;
//         }

//         this.sourcesTail = link;

//         const sourceReceiver = source.#receiver as Receiver | undefined;
//         if (sourceReceiver !== undefined) {
//           if (sourceReceiver.#refState === 1) {
//             sourceReceiver.#refState = 2;
//             sourceReceiver.#orb = sourceReceiver.#weakAtom ??= new WeakRef(
//               source
//             );
//           } else if (sourceReceiver.#refState === 2) {
//             sourceReceiver.#orb = source;
//             sourceReceiver.#refState = 3;
//           } else if (sourceReceiver.#refState === MAX_INT) {
//             throw new Error("Source has too many consumers");
//           } else {
//             sourceReceiver.#refState++;
//           }
//         }
//       }
//       startRead() {
//         const read: Reader = (readable) => {
//           if (read !== this.reader) {
//             throw new Error("Attempted to use expired read");
//           }
//           if (ORB in readable) {
//             this.#linkSource(readable[ORB]);
//             return readable.unwrap();
//           }
//           return readable(read);
//         };
//         this.reader = read;
//         return read;
//       }
//       commit(orb: Orb): undefined {
//         this.reader = undefined;
//         const sourcesTail = this.sourcesTail;
//         if (sourcesTail !== undefined) {
//           if (sourcesTail.nextSource !== undefined) {
//             Receiver.#recycleLinks(sourcesTail.nextSource);
//             sourcesTail.nextSource = undefined;
//           }
//         } else if (this.sources !== undefined) {
//           Receiver.#recycleLinks(this.sources);
//           this.sources = undefined;
//         }

//         if (this.#refState === 1) {
//           if (orb.#receiver !== this) {
//             throw new Error(
//               "Attempted to initialize receiver with non-owner orb"
//             );
//           }
//           this.#refState = 2;
//           this.#orb = this.#weakAtom ??= new WeakRef(orb);
//         }
//       }
//       execute<T>(fn: ReadableFn<T>, orb: Orb): T {
//         try {
//           return fn(this.startRead());
//         } finally {
//           this.commit(orb);
//         }
//       }
//       async executeAsync<T>(fn: ReadableFn<T>, orb: Orb): Promise<T> {
//         try {
//           return await fn(this.startRead());
//         } finally {
//           this.commit(orb);
//         }
//       }
//       hold(orb: Orb): Disposer {
//         if (this.#refState === 1) {
//           this.#refState = 3;
//           this.#orb = orb;
//         } else {
//           this.#refState++;
//           if (this.#refState === 3) {
//             this.#orb = orb;
//             this.#makeSourcesStrong();
//           }
//         }

//         let isDisposed = false;
//         return () => {
//           if (isDisposed) {
//             return;
//           }
//           isDisposed = true;
//           this.#refState--;
//           if (this.#refState === 2) {
//             this.#makeWeak();
//           }
//         };
//       }
//       #makeWeak() {
//         this.#orb = this.#weakAtom ??= new WeakRef(this.#orb as Orb);
//         let link = this.sources;
//         while (link !== undefined) {
//           const consumer = link.consumer as Receiver;
//           if (consumer.#refState > 2) {
//             consumer.#refState--;
//             if (consumer.#refState === 2) {
//               consumer.#makeWeak();
//             }
//           }
//           link = link.nextSource;
//         }
//       }
//       #makeSourcesStrong() {
//         let link = this.sources;
//         while (link !== undefined) {
//           const consumer = link.consumer as Receiver;
//           consumer.#refState++;
//           if (consumer.#refState === 3) {
//             const atom = (consumer.#orb as WeakRef<Orb>).deref();
//             consumer.#orb = atom;
//             if (atom === undefined) {
//               // Dispose receiver
//               consumer.#refState = 0;
//               // TODO recycle all sources
//             } else {
//               consumer.#makeSourcesStrong();
//             }
//           }
//           link = link.nextSource;
//         }
//       }
//       deref() {
//         if (this.#refState === 2) {
//           return (this.#orb as WeakRef<Orb>).deref();
//         }
//         return this.#orb as Orb | undefined;
//       }
//       static #recycleLinks(link: Link) {
//         do {
//           const source = link.source;
//           const nextConsumer = link.nextConsumer;
//           const prevConsumer = link.prevConsumer;

//           if (nextConsumer === undefined) {
//             source.#consumers!.prevConsumer = prevConsumer;
//           } else {
//             nextConsumer.prevConsumer = prevConsumer;
//           }
//           if (prevConsumer === undefined) {
//             source.#consumers = nextConsumer;
//           } else {
//             prevConsumer.nextConsumer = nextConsumer;
//           }
//           recycleLink(link);

//           const sourceReceiver = source.#receiver as Receiver | undefined;
//           if (sourceReceiver !== undefined && sourceReceiver.#refState > 2) {
//             sourceReceiver.#refState--;
//             if (sourceReceiver.#refState === 2) {
//               sourceReceiver.#makeWeak();
//             }
//           }

//           link = link.nextSource!;
//         } while (link !== undefined);
//       }
//     }
//   }
// }
