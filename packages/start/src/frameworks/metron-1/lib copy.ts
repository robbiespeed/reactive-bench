export type AtomAccessor<TValue = unknown> = (read: Reader) => TValue;

export type Atomic<TValue = unknown> = Atom<TValue> | AtomAccessor<TValue>;

export type Readable<TValue> = Atomic<TValue> | (TValue extends (...args: any[]) => unknown ? never : TValue);

export interface Reader {
  <TValue>(readable: Atomic<TValue>): TValue;
  <TValue>(readable: TValue):
    TValue extends (...args: any[]) => unknown ? never :
    TValue;
}

interface AtomConstructor {
  new <TValue>(): Atom<TValue>;
}

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

// TODO: Can I modify Relay to add back in static deps feature?
// Can Relay and Receiver be combined? Maybe if version is tracked by reader ref so it never overflows?
interface Relay<TValue = unknown> {
  value: TValue | undefined;
  depth: number;
  receiver: Receiver | undefined;
  run(read: Reader): TValue;
}

const MAX_VERSION = 0x7ffffffe;
const MAX_RECYCLE_VERSION = 0x7ffffff0;

// Atom Base Types
// ---
// Uninitialized
// State
// Derive Relay
// Compute Relay
// ... TODO:
// Ref
// Static Derive Relay
// Static Compute Relay
// ?? Destroyed, 

const ATOM_TYPE_NONE = 0;
const ATOM_TYPE_DESTROYED = 1;
const ATOM_TYPE_STATE = 2;
const ATOM_TYPE_REF = 3;
const ATOM_TYPE_DERIVE = 4;
const ATOM_TYPE_COMPUTE = 5;
const ATOM_TYPE_DERIVE_STATIC = 6;
const ATOM_TYPE_COMPUTE_STATIC = 7;


const ATOM_FLAG_NONE = 0;
const ATOM_FLAG_INITIALIZED = 1;
const ATOM_FLAG_RELAY = 1 << 1;

const ATOM_FLAG_OWNED = 8 << 1;
const ATOM_FLAG_DIRTY = 8 << 2;
const ATOM_FLAG_IN_RECEIVE = 8 << 3;
const ATOM_FLAG_CAN_HEAP = 8 << 4;
const ATOM_FLAG_IN_HEAP = 8 << 5;
const ATOM_FLAG_IN_FALLBACK_HEAP = 8 << 6;

const ATOM_FLAG_NON_IN_HEAP = ATOM_FLAG_RELAY | ATOM_FLAG_DIRTY | ATOM_FLAG_IN_RECEIVE | ATOM_FLAG_CAN_HEAP;

const disposedHandler = () => { };

// TODO: Could alternatively try special #value wrapper for owned Atoms
const owners = new WeakMap<Atom, Atom>();

let cleanReceiver: (receiver: Receiver) => undefined;
let createLink: (consumer: Receiver, source: Atom) => undefined;
let emit: (atom: Atom) => undefined;
let flagsGet: (atom: Atom) => number;
let initStateController: <TValue>(controller: AtomStateController<TValue>, atom: Atom<TValue>) => undefined;
let stabilize: () => undefined;
let stabilizeRelay: (relay: Relay, atom: Atom) => undefined;
let transmit: (atom: Atom) => undefined;
let stateSet: <TValue>(atom: Atom<TValue>, value: TValue) => undefined;
let insertIntoHeap: (atom: Atom) => undefined;
let createSubscription: (atom: Atom, handler: () => unknown, queue: AtomSubscription[]) => AtomSubscription;
let subHeadGet: (atom: Atom) => AtomSubscription | undefined;
let subHeadSet: (atom: Atom, subscription: AtomSubscription | undefined) => undefined;

class AtomStateController<TValue = unknown> {
  #atom!: Atom<TValue>;
  get atom() {
    return this.#atom;
  }
  setState(value: TValue): undefined {
    stateSet(this.#atom, value);
  }
  setOwner(owner: Atom): undefined {
    if (flagsGet(owner) & ATOM_FLAG_CAN_HEAP) {
      throw new Error("Owner must be an effect");
    }
    if (flagsGet(this.#atom) & ATOM_FLAG_OWNED) {
      throw new Error("Atom cannot have multiple owners");
    }
    owners.set(this.#atom, owner);
  }
  transmit(): undefined {
    transmit(this.#atom);
  }
  static {
    // TODO maybe not needed if constructor accepts uninitialized Atom and initializes it as a state Atom
    initStateController = function initStateController<TValue>(controller: AtomStateController<TValue>, atom: Atom<TValue>) {
      controller.#atom = atom;
    }
  }
}
export type { AtomStateController };

class AtomSubscription {
  #canQueue = true;
  #atom!: Atom;
  #handler!: () => unknown;
  #channelQueue!: AtomSubscription[];
  #next?: AtomSubscription;
  #prev?: AtomSubscription;
  run(): undefined {
    this.#canQueue = false;
    this.#handler();
  }
  [Symbol.dispose](): undefined {
    if (this.#handler === disposedHandler) {
      return;
    }
    this.#canQueue = false;
    this.#handler = disposedHandler;
    if (this.#prev === undefined) {
      subHeadSet(this.#atom, this.#next);
    } else {
      this.#prev.#next = this.#next;
    }
  }
  dispose(): undefined {
    this[Symbol.dispose]();
  }
  static {
    emit = function emit(atom) {
      let item = subHeadGet(atom);
      while (item !== undefined) {
        if (item.#canQueue) {
          item.#canQueue = false;
          item.#channelQueue.push(item);
        }
        item = item.#next;
      }
    }
    createSubscription = function createSubscription(atom, handler, queue) {
      const sub = new AtomSubscription();
      sub.#atom = atom;
      sub.#handler = handler;
      sub.#channelQueue = queue;
      const subHead = subHeadGet(atom);
      sub.#next = subHead;
      if (subHead !== undefined) {
        subHead.#prev = sub;
      }
      subHeadSet(atom, sub);
      return sub;
    }
  }
}

export class AtomSubscriptionChannel {
  #queue: AtomSubscription[] = [];
  #errorHandler: (cause: unknown) => undefined;
  #i = 0;
  constructor(errorHandler: (cause: unknown) => undefined) {
    this.#errorHandler = errorHandler;
  }
  subscribe(atom: Atom, handler: () => unknown) {
    return createSubscription(atom, handler, this.#queue);
  }
  run(): undefined {
    const queue = this.#queue;
    if (queue.length === 0) {
      return;
    }
    while (this.#i < queue.length) {
      const item = queue[this.#i++]!;
      try {
        item.run();
      } catch (err) {
        this.#errorHandler(err);
      }
    }
    this.#i = 0;
    queue.length = 0;
  }
}

export class Atom<TValue = unknown> {
  #flags = ATOM_FLAG_NONE;
  #state: unknown;
  #subscriptionHead: AtomSubscription | undefined;
  #consumerHead: Link | undefined;
  unwrap() {
    if (this.#flags === ATOM_FLAG_NONE) {
      throw new Error("Cannot unwrap uninitialized Atom");
    }
    if (this.#flags & ATOM_FLAG_OWNED) {
      owners.get(this)!.unwrap();
    }
    if (this.#flags & ATOM_FLAG_RELAY) {
      const relay = this.#state as Relay<TValue>;
      stabilizeRelay(relay, this);
      return relay.value!;
    }
    return this.#state as TValue;
  }
  static createStateController<TValue>(value: TValue): AtomStateController<TValue> {
    const atom = new (this as unknown as AtomConstructor)<TValue>();
    atom.#state = value;
    atom.#flags = ATOM_FLAG_INITIALIZED;
    const controller = new AtomStateController<TValue>();
    initStateController(controller, atom);
    return controller;
  }
  static createDerived<TValue>(deriver: (read: Reader) => TValue): Atom<TValue>
  static createDerived(deriver: (read: Reader) => undefined): Atom<undefined>
  static createDerived<TValue>(deriver: (read: Reader) => TValue) {
    const atom = new (this as unknown as AtomConstructor)<TValue>();
    atom.#state = {
      depth: 0,
      value: undefined,
      run: deriver,
      receiver: createReceiver(atom),
    } as Relay<TValue>;
    atom.#flags = ATOM_FLAG_INITIALIZED | ATOM_FLAG_DIRTY | ATOM_FLAG_RELAY;
    return atom;
  }
  static createComputed(computation: (this: Atom<never>, read: Reader) => undefined): Atom<undefined>
  static createComputed<TValue>(computation: (this: Atom<never>, read: Reader) => TValue): Atom<TValue>
  static createComputed<TValue>(computation: (this: Atom<never>, read: Reader) => TValue) {
    const atom = new (this as unknown as AtomConstructor)<TValue>();
    atom.#state = {
      depth: 0,
      value: undefined,
      run: computation,
      receiver: createReceiver(atom),
    } as Relay<TValue>;
    atom.#flags = ATOM_FLAG_INITIALIZED | ATOM_FLAG_DIRTY | ATOM_FLAG_RELAY | ATOM_FLAG_CAN_HEAP;
    insertIntoHeap(atom);
    return atom;
  }
  static createDerivedController<TValue>() { }
  static {
    flagsGet = function (atom) {
      return atom.#flags;
    }
    stateSet = function (atom, value) {
      if (atom.#state === value) {
        return;
      }
      atom.#state = value;
      transmit(atom);
    }
    subHeadGet = function (atom) {
      return atom.#subscriptionHead;
    }
    subHeadSet = function (atom, subscription) {
      atom.#subscriptionHead = subscription;
    }


    let transmitStack: Link[] = [];
    transmit = function transmit(atom: Atom) {
      emit(atom);

      let link = atom.#consumerHead;
      let consumer: Receiver;
      let nextConsumerLink: Link | undefined;
      let linkVersion: number;

      while (link !== undefined) {
        consumer = link.consumer;
        nextConsumerLink = link.nextConsumer;
        linkVersion = link.version;
        consumerHandler: if (consumer.version <= linkVersion) {
          let consumerAtom = consumer.transmitAtom;
          if (consumerAtom === undefined) {
            break consumerHandler;
          }
          if ("deref" in consumerAtom) {
            consumerAtom = consumerAtom.deref();
            if (consumerAtom === undefined) {
              consumer.version++;
              consumer.transmitAtom = undefined;
              consumer.sourceTail = undefined;
              consumer.scheduleCleaning();
              break consumerHandler;
            }
          }

          consumerAtom.#flags |= ATOM_FLAG_DIRTY;
          emit(consumerAtom);
          consumer.sourceTail = undefined;
          if ((consumer.version = linkVersion + 1) === MAX_VERSION) {
            // If Atom is managed then automatically create new strong receiver
            // otherwise allow weak receiver to be created lazily
            (consumerAtom.#state as Relay).receiver =
              consumer.transmitAtom === consumerAtom
                ? createReceiver(consumerAtom)
                : undefined;
            consumer.transmitAtom = undefined;
          }
          consumer.scheduleCleaning();

          if (consumerAtom.#flags & ATOM_FLAG_CAN_HEAP) {
            insertIntoHeap(consumerAtom);
          } else {
            const childLinks = consumerAtom.#consumerHead;
            if (childLinks !== undefined) {
              if (nextConsumerLink !== undefined) {
                transmitStack.push(nextConsumerLink);
              }
              link = childLinks;
              continue;
            }
          }
        }

        link = nextConsumerLink ?? transmitStack.pop();
      }
    }

    createLink = function createLink(consumer, source): undefined {
      const tail = consumer.sourceTail;
      let nextOld: Link | undefined;
      if (tail !== undefined) {
        if (tail.source === source) {
          return;
        }
        nextOld = tail.nextSource;
      } else {
        nextOld = consumer.sourceHead;
      }

      if (nextOld !== undefined && nextOld.source === source) {
        nextOld.version = consumer.version;
        nextOld.consumer = consumer;
        consumer.sourceTail = nextOld;
        return;
      }

      let link: Link;
      if (recycledLinkPool === undefined) {
        link = {
          version: consumer.version,
          source,
          consumer: consumer,
          nextSource: nextOld,
          nextConsumer: undefined,
          prevConsumer: undefined as any,
        };
      } else {
        link = recycledLinkPool as any;
        recycledLinkPool = recycledLinkPool.nextSource;
        link.consumer = consumer;
        link.source = source;
        link.nextSource = nextOld;
        link.version = consumer.version;
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
        consumer.sourceHead = link;
      } else {
        tail.nextSource = link;
      }
      consumer.sourceTail = link;
    }

    stabilizeRelay = function (relay, atom) {
      if (atom.#flags & (ATOM_FLAG_DIRTY | ATOM_FLAG_IN_HEAP)) {
        receive(atom);
      } else if (relay.depth >= minHeap && relay.receiver !== undefined) {
        stabilizeFallback(atom);
      }
    }

    function receive(receiveAtom: Atom): unknown {
      const relay = (receiveAtom.#state as Relay);
      const receiver = (relay.receiver ??= createReceiver(
        new WeakRef(receiveAtom)
      ));
      const deferFlag = receiveAtom.#flags & ATOM_FLAG_CAN_HEAP;
      receiveAtom.#flags = deferFlag | ATOM_FLAG_IN_RECEIVE;

      const version = receiver.version;
      const read: Reader = (atom) => {
        if (version !== receiver.version) {
          throw new Error("Attempted to use expired read");
        }
        // TODO: Bench cost of this vs read.maybeRaw(v), read.polymorphic(v), or polyAtom(read, v)
        switch (typeof atom) {
          case "function": return (atom as AtomAccessor)(read);
          case "object": {
            if (atom && #flags in atom) {
              break;
            }
            return atom;
          }
          default: return atom;
        }
        if (atom.#flags & ATOM_FLAG_IN_RECEIVE) {
          throw new Error("Cannot read atom while it is executing");
        }
        if (atom.#flags === ATOM_FLAG_NONE) {
          throw new Error("Cannot read uninitialized Atom");
        }
        createLink(receiver, atom);
        if (atom.#flags & ATOM_FLAG_OWNED) {
          const owner = owners.get(atom)!;
          const ownerRelay = (owner.#state as Relay);
          stabilizeRelay(ownerRelay, owner);

          if (deferFlag) {
            if (relay.depth <= ownerRelay.depth) {
              relay.depth = ownerRelay.depth + 1;
            }
          } else if (relay.depth < ownerRelay.depth) {
            relay.depth = ownerRelay.depth;
          }
        }
        if (atom.#flags & ATOM_FLAG_RELAY) {
          const atomRelay = (atom.#state as Relay);
          stabilizeRelay(atomRelay, atom);

          if (deferFlag) {
            if (relay.depth <= atomRelay.depth) {
              relay.depth = atomRelay.depth + 1;
            }
          } else if (relay.depth < atomRelay.depth) {
            relay.depth = atomRelay.depth;
          }
          return atomRelay.value!;
        }
        return atom.#state;
      };

      try {
        if (deferFlag) {
          const nextValue = relay.run.call(receiveAtom, read);
          if (relay.value !== nextValue && version !== 0) {
            relay.value = nextValue;
            transmit(receiveAtom);
          }
        } else {
          relay.value = relay.run.call(receiveAtom, read);
        }
      } catch (cause) {
        return cause;
      } finally {
        receiveAtom.#flags = deferFlag;
      }
    }

    cleanReceiver = function cleanReceiver(receiver) {
      const sourcesTail = receiver.sourceTail;
      let link =
        sourcesTail !== undefined
          ? sourcesTail.nextSource
          : receiver.sourceHead;
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
        receiver.sourceHead = undefined;
        if (
          receiver.transmitAtom === undefined &&
          receiver.version < MAX_RECYCLE_VERSION
        ) {
          receiver.nextDirty = recycledReceiverPool;
          recycledReceiverPool = receiver;
        }
      } else {
        sourcesTail.nextSource = undefined;
      }
    }

    let minHeap = Infinity;
    let maxHeap = 0;
    let nextMaxHeap = -1;
    const fallbackHeap: Atom[] = [];
    const stabilizeHeaps: (Atom[] | undefined)[] = new Array(200);

    insertIntoHeap = function insertIntoHeap(atom) {
      const flags = atom.#flags;
      if (flags & (ATOM_FLAG_IN_HEAP | ATOM_FLAG_IN_RECEIVE)) return;
      atom.#flags = (flags & ATOM_FLAG_NON_IN_HEAP) | ATOM_FLAG_IN_HEAP;
      const relay = atom.#state as Relay;
      const depth = relay.depth;
      (stabilizeHeaps[depth] ??= []).push(atom);
      if (depth > maxHeap) {
        maxHeap = depth;
      } else if (depth <= minHeap) {
        nextMaxHeap = depth;
      }
      if (depth < minHeap) {
        minHeap = depth;
      }
    }

    function moveHeap(atom: Atom) {
      const relay = (atom.#state as Relay)
      const depth = relay.depth;
      (stabilizeHeaps[depth] ??= []).push(atom);
      if (depth > maxHeap) {
        maxHeap = depth;
      } else if (depth <= minHeap) {
        nextMaxHeap = depth;
      }
    }

    function moveToFallbackHeap(atom: Atom) {
      const flags = atom.#flags;
      if (flags & ATOM_FLAG_IN_FALLBACK_HEAP) return;
      atom.#flags = (flags & ATOM_FLAG_NON_IN_HEAP) | ATOM_FLAG_IN_FALLBACK_HEAP;
      fallbackHeap.push(atom);
    }

    // function deleteFromHeap(atom: ReceiveAtom) {
    //   const flags = atom.#flags;
    //   if (!(flags & ATOM_FLAG_IN_HEAP)) return;
    //   heapSize--;
    //   atom.#flags = flags & ATOM_FLAG_NON_HEAP;
    // }

    function clearFallbackHeap() {
      for (let i = fallbackHeap.length - 1; i >= 0; i--) {
        const atom = fallbackHeap[i]!;
        atom.#flags &= ATOM_FLAG_NON_IN_HEAP;
      }
      fallbackHeap.length = 0;
    }

    function stabilizeFallback(rootAtom: Atom) {
      // TODO: Remove
      console.warn("Stabilize Fallback");
      const linkStack: Link[] = [];
      const receiveStack: Atom[] = [];
      let link = (rootAtom.#state as Relay).receiver!.sourceHead ?? undefined;
      let atom: Atom | undefined;
      while (link) {
        while (link) {
          atom = link.source;
          if (atom.#flags & ATOM_FLAG_OWNED) {
            if (atom.#flags & ATOM_FLAG_RELAY) {
              // TODO validate this works and if possible make it non recursive
              stabilizeFallback(owners.get(atom)!);
            } else {
              atom = owners.get(atom)!;
            }
          }
          const next: Link | undefined = link.nextSource ?? undefined;
          if (atom.#flags & ATOM_FLAG_RELAY) {
            const relay = (atom.#state as Relay);
            if (
              relay.depth < minHeap ||
              atom.#flags & (ATOM_FLAG_IN_RECEIVE | ATOM_FLAG_IN_FALLBACK_HEAP)
            ) {
              link = next;
              continue;
            }
            if (atom.#flags & (ATOM_FLAG_DIRTY | ATOM_FLAG_IN_HEAP)) {
              moveToFallbackHeap(atom);
              receive(atom);
              transmit(atom);
              link = next;
              continue;
            }
            moveToFallbackHeap(atom);
            receiveStack.push(atom);

            link = relay.receiver?.sourceHead;
            if (link && next) {
              linkStack.push(next);
              continue;
            }
          }
          link = next;
        }
        link = linkStack.pop();
        for (let i = receiveStack.length - 1; i >= 0; i--) {
          const atom = receiveStack[i]!;
          if (atom.#flags & (ATOM_FLAG_DIRTY | ATOM_FLAG_IN_HEAP)) {
            receive(atom);
          } else {
            atom.#flags &= ATOM_FLAG_IN_HEAP | ATOM_FLAG_IN_FALLBACK_HEAP;
          }
        }
        receiveStack.length = 0;
      }
      if (rootAtom.#flags & (ATOM_FLAG_DIRTY | ATOM_FLAG_IN_HEAP)) {
        receive(rootAtom);
      } else {
        rootAtom.#flags &= ATOM_FLAG_IN_HEAP | ATOM_FLAG_IN_FALLBACK_HEAP;
      }
    }

    stabilize = function stabilize() {
      while (maxHeap >= 0) {
        clearFallbackHeap();
        let heap: Atom[] | undefined;
        let atom: Atom;
        for (
          heap = stabilizeHeaps[minHeap];
          minHeap <= maxHeap;
          heap = stabilizeHeaps[++minHeap]
        ) {
          if (heap === undefined) {
            continue;
          }
          for (let i = 0; i < heap.length; i++) {
            atom = heap[i]!;
            const relay = atom.#state as Relay;
            if ((atom.#flags & ATOM_FLAG_IN_HEAP)) {
              if (relay.depth === minHeap) {
                receive(atom);
              } else {
                moveHeap(atom);
              }
            }
          }
          heap.length = 0;
        }
        minHeap = Infinity;
        maxHeap = nextMaxHeap;
        nextMaxHeap = -1;
      }
    }
  }
}

let recycledLinkPool: RecycledLink | undefined;
let dirtyReceiverPool: Receiver | undefined;
let recycledReceiverPool: Receiver | undefined;

class Receiver {
  version = 0; // should this be replaced with a linker fn ref?
  sourceHead: Link | undefined;
  sourceTail: Link | undefined;
  transmitAtom: WeakRef<Atom> | Atom | undefined;
  nextDirty: Receiver | undefined;
  constructor(atom: WeakRef<Atom> | Atom) {
    this.transmitAtom = atom;
  }
  scheduleCleaning() {
    if (this.nextDirty !== undefined) {
      // Already scheduled
      return;
    }
    const sourcesTail = this.sourceTail;
    if (
      (sourcesTail !== undefined
        ? sourcesTail.nextSource
        : this.sourceHead) !== undefined
    ) {
      this.nextDirty = dirtyReceiverPool ?? this;
      dirtyReceiverPool = this;
    }
  }
}

function createReceiver(atom: Atom | WeakRef<Atom>): Receiver {
  if (recycledReceiverPool === undefined) {
    return new Receiver(atom);
  }
  const receiver = recycledReceiverPool;
  recycledReceiverPool = recycledReceiverPool.nextDirty;
  receiver.transmitAtom = atom;
  receiver.nextDirty = undefined;
  return receiver;
}

// function disposeReceiver(relay: Relay) {
//   const receiver = relay.receiver as Receiver | undefined;
//   if (receiver === undefined) {
//     return;
//   }
//   relay.receiver = undefined;
//   receiver.version++;
//   receiver.transmitAtom = undefined;
//   receiver.sourceTail = undefined;
//   receiver.scheduleCleaning();
//   // Likely bad perf if used with DEFER atoms or if deeper consumer atoms are weak themselves
//   // because it will still propagate down the tree, where as with only non-DEFER and strong atoms,
//   // they can be disposed in deep -> shallow order and since no receive happens in that disposal cascade
//   // the last atoms to be disposed have nothing to propagate too.
//   ///
//   // In either case if DEFER flag this should be insertIntoHeap instead of transmit 
//   // transmit(atom);

//   // An alternative could be to destroy the atom so it cannot be revived
//   // would be as simple as adding a DESTROYED flag
//   // This may be the way to go...
//   // Or possibly it's okay to allow revive it, without transmitting/heaping when it gets disposed
//   //
//   // An issue with either of these alternatives is it would allow weak receivers to be hijacked and forced to break
//   // by any part of the program that chooses to, by simply managing then disposing.
//   //
//   // Perhaps only specific kinds of atoms can be managed, and must be managed first before they become functional.
//   // This would be paired with the DESTROYED flag approach, rather than allowing revives.
//   // Maybe also taking an approach like Preact where effects (managed atoms in this case)
//   // trigger strongly holding all up stream sources
//   //
//   // Or all source -> consumer links are always weak
// }

export function clean() {
  const first = dirtyReceiverPool;
  if (first === undefined) {
    return;
  }

  let receiver = first.nextDirty;
  first.nextDirty = undefined;

  if (receiver === first) {
    cleanReceiver(receiver);
    dirtyReceiverPool = undefined;
    return;
  }

  while (receiver !== undefined) {
    cleanReceiver(receiver);

    dirtyReceiverPool = receiver.nextDirty;
    receiver.nextDirty = undefined;
    receiver = dirtyReceiverPool;
  }
}

export { stabilize };

export function state<TValue>(initialValue: TValue) {
  const controller = Atom.createStateController(initialValue);
  return [
    controller.atom,
    controller.setState.bind(controller)
  ] as const;
}
export const derive = Atom.createDerived.bind(Atom);
export const compute = Atom.createComputed.bind(Atom);


export function selector<TKey>(input: Atomic<TKey>): (key: TKey) => Atom<boolean> {
  const controllers = new Map<TKey, AtomStateController<boolean>>();
  const outputs = new Map<TKey, WeakRef<Atom<boolean>>>();
  let activeKey: TKey | undefined;

  const projector = compute((read) => {
    const nextKey = read(input);
    if (activeKey !== nextKey) {
      controllers.get(activeKey!)?.setState(false);
      controllers.get(nextKey)?.setState(true);
      activeKey = nextKey;
    }
  });

  const finalizer = new FinalizationRegistry<TKey>((key) => {
    controllers.delete(key);
  });

  const select = (key: TKey): Atom<boolean> => {
    let controller = controllers.get(key);
    if (controller === undefined) {
      controller = Atom.createStateController(key === activeKey);
      controllers.set(key, controller);
      controller.setOwner(projector);
      const innerAtom = controller.atom;
      // Need to wrap because controller holds innerAtom strongly so it will never GC until the controller is removed from the map
      // TODO: make this a static deps derivation or a map(innerAtom, mapFn ?? defaultMapFn)
      // alternatively if the controller didn't hold the atom at all and instead only a internal state wrapper like Relay
      // then the innerAtom could be used directly. Controller.atom would need to be removed from the API
      // except there would be no way to trigger transmit with that approach.
      const atom = derive((read) => read(innerAtom));
      finalizer.register(atom, key, controller);
      return atom;
    }
    let atom = outputs.get(key)!.deref();
    if (atom === undefined) {
      finalizer.unregister(controller);
      const innerAtom = controller.atom;
      atom = derive((read) => read(innerAtom));
      finalizer.register(atom, key, controller);
    }

    return atom;
  };

  return select;
}