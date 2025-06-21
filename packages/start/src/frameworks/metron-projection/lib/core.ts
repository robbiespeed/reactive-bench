interface Link {
  version: number;
  consumer: Receiver;
  source: Atom;
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

interface Subscription {
  canQueue: boolean;
  handler: () => unknown;
  queue: Subscription[];
  next?: Subscription;
  prev?: Subscription;
}

interface Receiver {}

export interface Disposer {
  (): undefined;
}

export interface Reader {
  // <T extends Atom>(readable: T): T extends { unwrap(): infer U } ? U : never;
  <T>(readable: Atom<T>): T;
}

declare const r: Reader;

declare const a: StateAtom<3>;

r(a);

const MAX_INT = 0x7fffffff;

const MAX_VERSION = 0x7ffffffe;
const MAX_RECYCLE_VERSION = 0x7ffffff0;

const ATOM_FLAG_DIRTY = 0b0001;
const ATOM_FLAG_ATTACHED = 0b0010;
const ATOM_FLAG_PROJECTION = 0b0100;

export let clean: () => undefined;

let stabilize: (atom: Atom) => undefined;
let _AtomController;
let _EmitChannel;

export abstract class Atom<T = unknown> {
  #flags = 0b0000;
  #projectionDepth = 0;
  #consumerHead: Link | undefined;
  #subscriptionHead: Subscription | undefined;
  #receiver: Receiver | undefined;
  #emit(): undefined {
    let item = this.#subscriptionHead;
    while (item !== undefined) {
      if (item.canQueue) {
        item.canQueue = false;
        item.queue.push(item);
      }
      item = item.next;
    }
  }
  abstract unwrap(): T;
  static {
    let recycledLinkPool: RecycledLink | undefined;
    let dirtyReceiverPool: Receiver | undefined;
    let recycledReceiverPool: Receiver | undefined;

    class Receiver {
      #sourceHead: Link | undefined;
      #sourceTail: Link | undefined;
      #transmitAtom: WeakRef<Atom> | Atom | undefined;
      #nextDirty: Receiver | undefined;
      #version = 0;
      constructor(atom: WeakRef<Atom> | Atom) {
        this.#transmitAtom = atom;
      }
      #linkSource(source: Atom): undefined {
        const tail = this.#sourceTail;
        let nextOld: Link | undefined;
        if (tail !== undefined) {
          if (tail.source === source) {
            return;
          }
          nextOld = tail.nextSource;
        } else {
          nextOld = this.#sourceHead;
        }

        if (nextOld !== undefined && nextOld.source === source) {
          nextOld.version = this.#version;
          nextOld.consumer = this;
          this.#sourceTail = nextOld;
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

        const sourceConsumers = source.#consumerHead;
        if (sourceConsumers === undefined) {
          link.prevConsumer = link;
          source.#consumerHead = link;
        } else {
          const oldConsumerTail = sourceConsumers.prevConsumer!;
          sourceConsumers.prevConsumer = link;
          link.prevConsumer = oldConsumerTail;
          oldConsumerTail.nextConsumer = link;
        }

        if (tail === undefined) {
          this.#sourceHead = link;
        } else {
          tail.nextSource = link;
        }
        this.#sourceTail = link;
      }
      #scheduleCleaning() {
        if (this.#nextDirty !== undefined) {
          // Already scheduled
          return;
        }
        const sourcesTail = this.#sourceTail;
        if (
          (sourcesTail !== undefined
            ? sourcesTail.nextSource
            : this.#sourceHead) !== undefined
        ) {
          this.#nextDirty = dirtyReceiverPool ?? this;
          dirtyReceiverPool = this;
        }
      }
      static {
        function cleanReceiver(receiver: Receiver): undefined {
          const sourcesTail = receiver.#sourceTail;
          let link =
            sourcesTail !== undefined
              ? sourcesTail.nextSource
              : receiver.#sourceHead;
          while (link !== undefined) {
            const source = link.source;
            const prevConsumer = link.prevConsumer;
            if (prevConsumer === link) {
              source.#consumerHead = undefined;
            } else {
              const nextConsumer = link.nextConsumer;
              if (nextConsumer === undefined) {
                source.#consumerHead!.prevConsumer = prevConsumer;
              } else {
                nextConsumer.prevConsumer = prevConsumer;
              }
              if (link === source.#consumerHead) {
                source.#consumerHead = nextConsumer;
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
            receiver.#sourceHead = undefined;
            if (
              receiver.#transmitAtom === undefined &&
              receiver.#version < MAX_RECYCLE_VERSION
            ) {
              receiver.#nextDirty = recycledReceiverPool;
              recycledReceiverPool = receiver;
            }
          } else {
            sourcesTail.nextSource = undefined;
          }
        }

        function createReceiver(atom: Atom | WeakRef<Atom>): Receiver {
          if (recycledReceiverPool === undefined) {
            return new Receiver(atom);
          }
          const receiver = recycledReceiverPool;
          recycledReceiverPool = recycledReceiverPool.#nextDirty;
          receiver.#transmitAtom = atom;
          receiver.#nextDirty = undefined;
          return receiver;
        }

        function transmit(atom: Atom): undefined {
          atom.#emit();

          const stack: Link[] = [];
          let link = atom.#consumerHead;
          let consumer: Receiver;
          let nextConsumerLink: Link | undefined;
          let linkVersion: number;

          while (link !== undefined) {
            consumer = link.consumer as Receiver;
            nextConsumerLink = link.nextConsumer;
            linkVersion = link.version;
            consumerHandler: if (consumer.#version <= linkVersion) {
              let consumerOrb = consumer.#transmitAtom;
              if (consumerOrb === undefined) {
                break consumerHandler;
              }
              if ("deref" in consumerOrb) {
                consumerOrb = consumerOrb.deref();
                if (consumerOrb === undefined) {
                  consumer.#version++;
                  consumer.#transmitAtom = undefined;
                  consumer.#sourceTail = undefined;
                  consumer.#scheduleCleaning();
                  break consumerHandler;
                }
              }

              consumerOrb.#emit();
              if (linkVersion !== MAX_INT) {
                consumer.#sourceTail = undefined;
                if ((consumer.#version = linkVersion + 1) === MAX_VERSION) {
                  // If Atom is managed then automatically create new strong receiver
                  // otherwise allow weak receiver to be created lazily
                  consumerOrb.#receiver =
                    consumer.#transmitAtom === consumerOrb
                      ? createReceiver(consumerOrb)
                      : undefined;
                  consumer.#transmitAtom = undefined;
                }
                consumer.#scheduleCleaning();
              }
              const childLinks = consumerOrb.#consumerHead;
              if (childLinks !== undefined) {
                if (nextConsumerLink !== undefined) {
                  stack.push(nextConsumerLink);
                }
                link = childLinks;
                continue;
              }
            }

            link = nextConsumerLink ?? stack.pop();
          }
          // propagationChannel.run();
        }

        function disposeReceiver(atom: Atom) {
          const receiver = atom.#receiver as Receiver | undefined;
          if (receiver === undefined) {
            return;
          }
          atom.#receiver = undefined;
          receiver.#version++;
          receiver.#transmitAtom = undefined;
          receiver.#sourceTail = undefined;
          receiver.#scheduleCleaning();
          transmit(atom);
        }

        const projectionChannels: EmitChannel[] = [];

        function runProjections(depth: number) {
          for (let i = 0; i < depth; i++) {
            projectionChannels[i]!.run();
          }
        }

        stabilize = function stabilize(atom) {
          propagationChannel.run();
          if (
            atom.#projectionDepth > 0 &&
            (atom.#flags & ATOM_FLAG_DIRTY) === 0b0
          ) {
            runProjections(atom.#projectionDepth);
          }
        };

        class AtomController {
          #atom: Atom;
          constructor(atom: Atom) {
            if (atom.#flags & ATOM_FLAG_ATTACHED) {
              throw new Error("Atom has existing controller");
            }
            atom.#flags |= ATOM_FLAG_ATTACHED;
            this.#atom = atom;
          }
          get atom() {
            return this.#atom;
          }
          manage(): Disposer {
            let atom: Atom | undefined = this.#atom;
            let receiver = atom.#receiver as Receiver | undefined;
            if (receiver === undefined) {
              atom.#receiver = createReceiver(atom);
            } else {
              if (receiver.#transmitAtom === atom) {
                throw new Error("Attempted to manage orb multiple times");
              }
              receiver.#transmitAtom = atom;
            }

            return () => {
              atom !== undefined && (disposeReceiver(atom), (atom = undefined));
            };
          }
          receive<T>(fn: (read: Reader) => T): T {
            // if ((this.#atom.#flags & ATOM_FLAG_DIRTY) === 0b0000) {
            //   transmit(this.#atom);
            // }
            const receiver = (this.#atom.#receiver ??= createReceiver(
              new WeakRef(this.#atom)
            )) as Receiver;
            const version = receiver.#version;
            const read: Reader = (atom) => {
              if (version !== receiver.#version) {
                throw new Error("Attempted to use expired read");
              }
              receiver.#linkSource(atom);
              return atom.unwrap();
            };

            return fn(read);
          }
          transmit(): undefined {
            transmit(this.#atom);
          }
        }
        _AtomController = AtomController;

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
    const disposedHandler = () => {};
    class EmitChannel {
      #queue: Subscription[] = [];
      #errorHandler: (cause: unknown) => undefined;
      #i = 0;
      constructor(errorHandler: (cause: unknown) => undefined) {
        this.#errorHandler = errorHandler;
      }
      subscribe(atom: Atom, handler: () => undefined): Disposer {
        const subHead = atom.#subscriptionHead;
        const sub: Subscription = {
          canQueue: true,
          handler,
          queue: this.#queue,
          next: subHead,
          prev: undefined,
        };
        if (subHead !== undefined) {
          subHead.prev = sub;
        }
        atom.#subscriptionHead = sub;

        return EmitChannel.#disposer.bind(atom, sub);
      }
      run(): undefined {
        const queue = this.#queue;
        if (queue.length === 0) {
          return;
        }
        while (this.#i < queue.length) {
          const item = queue[this.#i++]!;
          item.canQueue = true;
          try {
            item.handler();
          } catch (err) {
            this.#errorHandler(err);
          }
        }
        this.#i = 0;
        queue.length = 0;
      }
      static #disposer(this: Atom, sub: Subscription): undefined {
        if (sub.handler === disposedHandler) {
          return;
        }
        sub.canQueue = false;
        sub.handler = disposedHandler;
        const { prev } = sub;
        if (prev === undefined) {
          this.#subscriptionHead = sub.next;
        } else {
          prev.next = sub.next;
        }
      }
    }
    _EmitChannel = EmitChannel;
  }
}

export const AtomController = _AtomController;
export type AtomController = InstanceType<typeof AtomController>;

export const EmitChannel = _EmitChannel;
export type EmitChannel = InstanceType<typeof EmitChannel>;

export const propagationChannel = new EmitChannel((cause) => {});

export class StateAtom<T> extends Atom<T> {
  #controller: AtomController;
  #store: T;
  constructor(initialValue: T) {
    super();
    this.#controller = new AtomController(this);
    this.#store = initialValue;
  }
  set(value: T): undefined {
    if (value === this.#store) {
      return;
    }
    this.#store = value;
    this.#controller.transmit();
  }
  unwrap(): T {
    stabilize(this);
    return this.#store;
  }
  manage(): Disposer {
    return () => {};
  }
}

const EMPTY_CACHE = Symbol();

export class DeriveAtom<T> extends Atom<T> {
  #controller: AtomController;
  #deriveFn: (read: Reader) => T;
  #store: T | typeof EMPTY_CACHE = EMPTY_CACHE;
  constructor(derivation: (read: Reader) => T) {
    super();
    this.#controller = new AtomController(this);
    propagationChannel.subscribe(this, () => {
      this.#store = EMPTY_CACHE;
    });
    this.#deriveFn = derivation;
  }
  unwrap(): T {
    stabilize(this);
    if (this.#store !== EMPTY_CACHE) {
      return this.#store;
    }
    this.#store = this.#controller.receive(this.#deriveFn);
    return this.#store;
  }
  manage() {
    return this.#controller.manage();
  }
}

export const state = <T>(initialValue: T) => new StateAtom(initialValue);
export const derive = <T>(derivation: (read: Reader) => T) =>
  new DeriveAtom(derivation);
