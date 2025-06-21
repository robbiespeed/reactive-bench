import type { Disposer } from "#lib/frameworks/metron-a/lib/shared";
import {
  EmitController,
  EMITTER,
  type Emittable,
} from "#lib/frameworks/metron-a/lib/emitter";

interface IReceiver {
  sources: Link | undefined;
  sourcesTail: Link | undefined;
  deref(): Atom | undefined;
  hold(atom: Atom): Disposer;
  // createReader(): Reader;
  reader?: Reader;
  initReader(): undefined;
  startRead(atom: Atom): undefined;
  endRead(): undefined;
}

interface Link {
  consumer: IReceiver;
  source: Atom;
  nextSource: Link | undefined;
  nextConsumer: Link | undefined;
  prevConsumer: Link | undefined;
}

interface RecycledLink {
  consumer: IReceiver | undefined;
  source: Atom | undefined;
  nextSource: Link | undefined;
  nextConsumer: Link | undefined;
  prevConsumer: Link | undefined;
}

interface ReadableFn<T> {
  (read: Reader): T;
}

type Readable<T> = ReadableFn<T> | Atom<T>;

interface Reader {
  <T>(readable: Readable<T>): T;
}

const noOp = (): undefined => {};

let poolLink: RecycledLink | undefined = undefined;

function getLink(source: Atom, consumer: IReceiver): Link {
  if (poolLink) {
    const link = poolLink as unknown as Link;
    poolLink = link.nextSource;
    link.nextSource = undefined;
    link.consumer = consumer;
    link.source = source;
    return link as Link;
  } else {
    return {
      consumer,
      source,
      nextConsumer: undefined,
      nextSource: undefined,
      prevConsumer: undefined,
    };
  }
}

function recycleLink(link: RecycledLink) {
  link.consumer = undefined;
  link.source = undefined;
  link.nextConsumer = undefined;
  link.nextSource = undefined;
  link.prevConsumer = undefined;
  poolLink = link;
}

export const EMPTY_CACHE = Symbol();

const MAX_INT = 0x7fffffff;

let isPropagating = false;

export abstract class Atom<T = unknown> implements Emittable {
  #consumers: Link | undefined;
  #intercept!: () => boolean;
  #receiver: undefined | IReceiver;
  #emitController: undefined | EmitController;
  // Breadth first propagation
  // #propagate() {
  //   isPropagating = true;
  //   this.#emitController?.emit();
  //   let linkHead = this.#consumers;
  //   let link = linkHead;
  //   let queueHead: Link | undefined;
  //   let queueTail: Link | undefined;

  //   let n = 0;
  //   let x = 0;
  //   let y = 0;
  //   let z = 0;

  //   while (link !== undefined) {
  //     n++;
  //     const consumer = link.consumer;
  //     let nextConsumer = link.nextConsumer;
  //     if (consumer.canPropagate()) {
  //       x++;
  //       const consumerTransmitter = consumer.deref();

  //       if (consumerTransmitter === undefined) {
  //         // console.log("Freeing dead link");
  //         const prevConsumer = link.prevConsumer;

  //         if (prevConsumer === undefined) {
  //           link.source.#consumers = nextConsumer;
  //         } else {
  //           if (nextConsumer !== undefined) {
  //             nextConsumer.prevConsumer = prevConsumer;
  //           }
  //           prevConsumer.nextConsumer = nextConsumer;
  //         }

  //         // TODO free receiver since it can no longer

  //         recycleLink(link);
  //         if (link === linkHead) {
  //           linkHead = nextConsumer;
  //         } else {
  //           link = prevConsumer;
  //         }
  //       } else if (consumerTransmitter.#intercept()) {
  //         y++;
  //         consumer.releaseSources();
  //         consumerTransmitter.#emitController?.emit();
  //         const childLinks = consumerTransmitter.#consumers;
  //         if (childLinks !== undefined) {
  //           z++;
  //           childLinks.prevConsumer = undefined;
  //           if (queueHead === undefined) {
  //             queueHead = queueTail = childLinks;
  //           } else {
  //             queueTail!.prevConsumer = childLinks;
  //             queueTail = childLinks;
  //           }
  //         }
  //       }
  //     }

  //     if (nextConsumer === undefined) {
  //       if (linkHead !== undefined) {
  //         // Restore tail back-link
  //         linkHead.prevConsumer = link;
  //       }
  //       if (queueHead !== undefined) {
  //         link = linkHead = queueHead;
  //         queueHead = queueHead.prevConsumer;
  //         continue;
  //       }
  //       break;
  //     }
  //     link = nextConsumer;
  //   }
  //   isPropagating = false;
  //   console.log(`n ${n}; x ${x}; y ${y}; z ${z}`);
  // }
  // Depth first propagation
  #propagate() {
    isPropagating = true;
    this.#emitController?.emit();
    let link = this.#consumers;
    let stack: Link[] = [];

    // let n = 0;
    // let x = 0;
    // let y = 0;
    // let z = 0;

    while (link !== undefined) {
      // n++;
      const consumer = link.consumer;
      let nextConsumer = link.nextConsumer; // const?
      if (consumer.sourcesTail !== undefined) {
        // x++;
        const consumerTransmitter = consumer.deref();

        if (consumerTransmitter === undefined) {
          // console.log("Freeing dead link");
          const prevConsumer = link.prevConsumer;

          if (prevConsumer === undefined) {
            link.source.#consumers = nextConsumer;
          } else {
            if (nextConsumer !== undefined) {
              nextConsumer.prevConsumer = prevConsumer;
            }
            prevConsumer.nextConsumer = nextConsumer;
          }

          // TODO free receiver since it can no longer

          recycleLink(link);
        } else if (consumerTransmitter.#intercept()) {
          // y++;
          consumer.sourcesTail = undefined;
          consumerTransmitter.#emitController?.emit();
          const childLinks = consumerTransmitter.#consumers;
          if (childLinks !== undefined) {
            if (nextConsumer !== undefined) {
              // z++;
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
    // console.log(`n ${n}; x ${x}; y ${y}; z ${z}`);
  }
  hold() {
    return this.#receiver?.hold(this) ?? noOp;
  }
  get [EMITTER]() {
    return (this.#emitController ??= new EmitController()).emitter;
  }
  abstract unwrap(): T;
  static StateAtom = class StateAtom<T> extends Atom<T> implements Emittable {
    #store: T;
    constructor(initialValue: T) {
      super();
      this.#store = initialValue;
    }
    set(value: T): undefined {
      if (value === this.#store) {
        return;
      }
      this.#store = value;
      this.#propagate();
    }
    override unwrap(): T {
      return this.#store;
    }
  };
  static DerivedAtom = class DerivedAtom<T> extends Atom<T> {
    #store: T | typeof EMPTY_CACHE = EMPTY_CACHE;
    #derive: (read: Reader) => T;
    constructor(derive: (this: DerivedAtom<unknown>, read: Reader) => T) {
      super();
      this.#derive = derive;
      this.#intercept = () => {
        if (this.#store === EMPTY_CACHE) {
          return false;
        }
        this.#store = EMPTY_CACHE;
        return true;
      };
      this.#receiver = new Atom.#Receiver();
    }
    override unwrap(): T {
      if (this.#store !== EMPTY_CACHE) {
        return this.#store;
      }

      // TODO: change this to `this.#receiver.execute(this.#derive)`?
      // What about async
      this.#receiver!.startRead(this);
      this.#store = this.#derive(this.#receiver!.reader!);
      this.#receiver!.endRead();

      return this.#store;
    }
  };
  static #Receiver = class Receiver implements IReceiver {
    #refState = 1;
    reader?: Reader;
    sources: Link | undefined;
    sourcesTail: Link | undefined;
    #weakAtom: WeakRef<Atom> | undefined;
    #atom: Atom | WeakRef<Atom> | undefined;
    #linkSource(source: Atom): undefined {
      if (isPropagating) {
        throw new Error("TODO MESSAGE");
      }

      const tail = this.sourcesTail;
      const nextOld = tail === undefined ? this.sources : tail.nextSource;

      if (nextOld?.source === source) {
        this.sourcesTail = nextOld;
        return;
      }
      if (tail?.source === source) {
        return;
      }

      const link = getLink(source, this);
      link.nextSource = nextOld;
      if (tail === undefined) {
        this.sources = link;
      } else {
        tail.nextSource = link;
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

      this.sourcesTail = link;

      const sourceReceiver = source.#receiver as Receiver | undefined;
      if (sourceReceiver !== undefined) {
        if (this.#refState > 2) {
          if (sourceReceiver.#refState < 3) {
            sourceReceiver.#atom = source;
            sourceReceiver.#refState = 3;
          } else if (sourceReceiver.#refState === MAX_INT) {
            throw new Error("Source has too many consumers");
          } else {
            sourceReceiver.#refState++;
          }
        } else if (sourceReceiver.#refState === 1) {
          sourceReceiver.#refState = 2;
          sourceReceiver.#atom = sourceReceiver.#weakAtom ??= new WeakRef(
            source
          );
        }
      }
    }
    startRead(atom: Atom): undefined {
      const read: Reader = (readable) => {
        if (read !== this.reader) {
          throw new Error("Reader is inactive");
        }
        if (#consumers in readable) {
          this.#linkSource(readable);
          return readable.unwrap();
        }
        return readable(read);
      };
      this.reader = read;
      if (this.#refState === 1) {
        this.#refState = 2;
        this.#atom = this.#weakAtom ??= new WeakRef(atom);
      }
    }
    endRead(): undefined {
      this.reader = undefined;
      const sourcesTail = this.sourcesTail;
      if (sourcesTail !== undefined) {
        if (sourcesTail.nextSource !== undefined) {
          Receiver.#recycleLinks(sourcesTail.nextSource);
          sourcesTail.nextSource = undefined;
        }
      } else if (this.sources !== undefined) {
        Receiver.#recycleLinks(this.sources);
        this.sources = undefined;
      }
    }
    hold(atom: Atom): Disposer {
      if (this.#refState === 1) {
        this.#refState = 3;
        this.#atom = atom;
      } else {
        this.#refState++;
        if (this.#refState === 3) {
          this.#atom = atom;
          this.#makeSourcesStrong();
        }
      }

      let isDisposed = false;
      return () => {
        if (isDisposed) {
          return;
        }
        isDisposed = true;
        this.#refState--;
        if (this.#refState === 2) {
          this.#makeWeak();
        }
      };
    }
    #makeWeak() {
      this.#atom = this.#weakAtom ??= new WeakRef(this.#atom as Atom);
      let link = this.sources;
      while (link !== undefined) {
        const consumer = link.consumer as Receiver;
        if (consumer.#refState > 2) {
          consumer.#refState--;
          if (consumer.#refState === 2) {
            consumer.#makeWeak();
          }
        }
        link = link.nextSource;
      }
    }
    #makeSourcesStrong() {
      let link = this.sources;
      while (link !== undefined) {
        const consumer = link.consumer as Receiver;
        consumer.#refState++;
        if (consumer.#refState === 3) {
          const atom = (consumer.#atom as WeakRef<Atom>).deref();
          if (atom === undefined) {
            consumer.#atom = undefined;
            consumer.#refState = 0;
            // TODO clear all sources
          } else {
            consumer.#atom = atom;
            consumer.#makeSourcesStrong();
          }
        }
        link = link.nextSource;
      }
    }
    deref() {
      if (this.#refState === 2) {
        return (this.#atom as WeakRef<Atom>).deref();
      }
      return this.#atom as Atom | undefined;
    }
    initReader(): undefined {
      const read: Reader = (readable) => {
        if (read !== this.reader) {
          throw new Error("Reader is inactive");
        }
        if (#consumers in readable) {
          this.#linkSource(readable);
          return readable.unwrap();
        }
        return readable(read);
      };
      this.reader = read;
    }
    createReader() {
      const read = <T>(readable: Readable<T>): T => {
        if (#consumers in readable) {
          this.#linkSource(readable as Atom);
          return readable.unwrap();
        }
        return readable(read);
      };
      return read;
    }
    static #recycleLinks(link: Link) {
      do {
        const source = link.source;
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
        recycleLink(link);

        const sourceReceiver = source.#receiver as Receiver | undefined;
        if (sourceReceiver !== undefined && sourceReceiver.#refState > 2) {
          sourceReceiver.#refState--;
          if (sourceReceiver.#refState === 2) {
            sourceReceiver.#makeWeak();
          }
        }

        link = link.nextSource!;
      } while (link !== undefined);
    }
  };
}

export const StateAtom = Atom.StateAtom;
export const DerivedAtom = Atom.DerivedAtom;

export interface StateAtom<T> extends Atom<T> {
  set(value: T): undefined;
}
