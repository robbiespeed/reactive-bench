/*
# TODO

- Rename Projection Depth to Effect Depth
- Move Effect Depth to Receiver
- Create ChildReceiver for Projected/Attached Atoms
- Create Effectual Flag
- Figure out how depth change will happen, can't be deferred until end of compute like r3 because compute is possibly async
- Figure out how effect depth can be assigned in component like situations without need to depend on parent components to increase depth
  This is primarily for ensuring proper execution order in nested reactive conditionals
- Create EffectDepthChannel or handle depth in existing Channel since there shouldn't be a use-case for a non-depth ordered Channel 

*/

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

export interface Disposer {
  (): undefined;
}

export interface Reader {
  // <T extends Atom>(readable: T): T extends { unwrap(): infer U } ? U : never;
  <T>(readable: Atom<T>): T;
}

const MAX_INT = 0x7fffffff;

const MAX_VERSION = 0x7ffffffe;
const MAX_RECYCLE_VERSION = 0x7ffffff0;

/*

Atom types:
State
OwnedState
Receive
OwnedReceive
ReceiveStabilize
OwnedReceiveStabilize
*/

const ATOM_FLAG_NONE = 0;
const ATOM_FLAG_DEFER = 1;
const ATOM_FLAG_DIRTY = 1 << 1;
const ATOM_FLAG_IN_HEAP = 1 << 2;
const ATOM_FLAG_IN_FALLBACK_HEAP = 1 << 3;
const ATOM_FLAG_IN_RECEIVE = 1 << 4;

const ATOM_FLAG_NON_HEAP = ATOM_FLAG_DEFER | ATOM_FLAG_DIRTY | ATOM_FLAG_IN_RECEIVE;

class Atom<TValue = unknown> {
  _flags = ATOM_FLAG_NONE;
  _value: TValue;
  _owner: ReceiveAtom | undefined = undefined;
  _consumerHead: Link | undefined;
  _subscriptionHead: Subscription | undefined;
  constructor(value: TValue) {
    this._value = value;
  }
  set(value: TValue): undefined {
    this._value = value;
    transmit(this);
  }
  unwrap(): TValue {
    if (this._flags & ATOM_FLAG_IN_RECEIVE) {
      throw new Error("Cannot unwrap atom while it is executing");
    }
    const owner = this._owner;
    if (owner !== undefined) {
      stabilizeReceiveAtom(owner);
    }
    if ("_fn" in this) {
      stabilizeReceiveAtom(this as any);
    }
    return this._value;
  }
}

class ReceiveAtom<TValue = unknown> extends Atom<TValue> {
  _fn: (read: Reader) => TValue;
  _depth = -1;
  _receiver: Receiver | undefined;
  constructor(fn: (read: Reader) => TValue, isDeferred = false) {
    super(undefined as TValue);
    if (isDeferred) {
      this._depth = 0;
      this._flags = ATOM_FLAG_DIRTY | ATOM_FLAG_DEFER;
    } else {
      this._flags = ATOM_FLAG_DIRTY;
    }
    this._fn = fn;
  }
  manage(): Disposer {
    let receiver = this._receiver as Receiver | undefined;
    if (receiver === undefined) {
      this._receiver = createReceiver(this);
    } else {
      if (receiver._transmitAtom === this) {
        throw new Error("Attempted to manage atom multiple times");
      }
      receiver._transmitAtom = this;
    }
    let active = true;

    return () => {
      active &&
        (disposeReceiver(this), (active = false));
    };
  }
}

let recycledLinkPool: RecycledLink | undefined;
let dirtyReceiverPool: Receiver | undefined;
let recycledReceiverPool: Receiver | undefined;

class Receiver {
  _version = 0; // should this be replaced with a linker fn ref?
  _sourceHead: Link | undefined;
  _sourceTail: Link | undefined;
  _transmitAtom: ReceiveAtom | undefined;
  _nextDirty: Receiver | undefined;
  constructor(atom: ReceiveAtom) {
    this._transmitAtom = atom;
  }
  _linkSource(source: Atom): undefined {
    const tail = this._sourceTail;
    let nextOld: Link | undefined;
    if (tail !== undefined) {
      if (tail.source === source) {
        return;
      }
      nextOld = tail.nextSource;
    } else {
      nextOld = this._sourceHead;
    }

    if (nextOld !== undefined && nextOld.source === source) {
      nextOld.version = this._version;
      nextOld.consumer = this;
      this._sourceTail = nextOld;
      return;
    }

    let link: Link;
    if (recycledLinkPool === undefined) {
      link = {
        version: this._version,
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
      link.version = this._version;
    }

    const sourceConsumers = source._consumerHead;
    if (sourceConsumers === undefined) {
      link.prevConsumer = link;
      source._consumerHead = link;
    } else {
      const oldConsumerTail = sourceConsumers.prevConsumer!;
      sourceConsumers.prevConsumer = link;
      link.prevConsumer = oldConsumerTail;
      oldConsumerTail.nextConsumer = link;
    }

    if (tail === undefined) {
      this._sourceHead = link;
    } else {
      tail.nextSource = link;
    }
    this._sourceTail = link;
  }
  _scheduleCleaning() {
    if (this._nextDirty !== undefined) {
      // Already scheduled
      return;
    }
    const sourcesTail = this._sourceTail;
    if (
      (sourcesTail !== undefined
        ? sourcesTail.nextSource
        : this._sourceHead) !== undefined
    ) {
      this._nextDirty = dirtyReceiverPool ?? this;
      dirtyReceiverPool = this;
    }
  }
}

function cleanReceiver(receiver: Receiver): undefined {
  const sourcesTail = receiver._sourceTail;
  let link =
    sourcesTail !== undefined
      ? sourcesTail.nextSource
      : receiver._sourceHead;
  while (link !== undefined) {
    const source = link.source;
    const prevConsumer = link.prevConsumer;
    if (prevConsumer === link) {
      source._consumerHead = undefined;
    } else {
      const nextConsumer = link.nextConsumer;
      if (nextConsumer === undefined) {
        source._consumerHead!.prevConsumer = prevConsumer;
      } else {
        nextConsumer.prevConsumer = prevConsumer;
      }
      if (link === source._consumerHead) {
        source._consumerHead = nextConsumer;
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
    receiver._sourceHead = undefined;
    if (
      receiver._transmitAtom === undefined &&
      receiver._version < MAX_RECYCLE_VERSION
    ) {
      receiver._nextDirty = recycledReceiverPool;
      recycledReceiverPool = receiver;
    }
  } else {
    sourcesTail.nextSource = undefined;
  }
}

function createReceiver(atom: ReceiveAtom): Receiver {
  if (recycledReceiverPool === undefined) {
    return new Receiver(atom);
  }
  const receiver = recycledReceiverPool;
  recycledReceiverPool = recycledReceiverPool._nextDirty;
  receiver._transmitAtom = atom;
  receiver._nextDirty = undefined;
  return receiver;
}

function emit(atom: Atom): undefined {
  let item = atom._subscriptionHead;
  while (item !== undefined) {
    if (item.canQueue) {
      item.canQueue = false;
      item.queue.push(item);
    }
    item = item.next;
  }
}

let transmitStack: Link[] = [];
function transmit(atom: Atom): undefined {
  emit(atom);

  let link = atom._consumerHead;
  let consumer: Receiver;
  let nextConsumerLink: Link | undefined;
  let linkVersion: number;

  while (link !== undefined) {
    consumer = link.consumer as Receiver;
    nextConsumerLink = link.nextConsumer;
    linkVersion = link.version;
    consumerHandler: if (consumer._version <= linkVersion) {
      let consumerAtom = consumer._transmitAtom;
      if (consumerAtom === undefined) {
        break consumerHandler;
      }
      // if ("deref" in consumerAtom) {
      //   consumerAtom = consumerAtom.deref();
      //   if (consumerAtom === undefined) {
      //     consumer._version++;
      //     consumer._transmitAtom = undefined;
      //     consumer._sourceTail = undefined;
      //     consumer._scheduleCleaning();
      //     break consumerHandler;
      //   }
      // }

      consumerAtom._flags |= ATOM_FLAG_DIRTY;
      emit(consumerAtom);
      consumer._sourceTail = undefined;
      if ((consumer._version = linkVersion + 1) === MAX_VERSION) {
        // If Atom is managed then automatically create new strong receiver
        // otherwise allow weak receiver to be created lazily
        consumerAtom._receiver =
          consumer._transmitAtom === consumerAtom
            ? createReceiver(consumerAtom)
            : undefined;
        consumer._transmitAtom = undefined;
      }
      consumer._scheduleCleaning();

      if (consumerAtom._flags & ATOM_FLAG_DEFER) {
        insertIntoHeap(consumerAtom);
      } else {
        const childLinks = consumerAtom._consumerHead;
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

// This should be controller.createChild returns ChildController
export function attach(atom: Atom, owner: ReceiveAtom) {
  if (atom._owner !== undefined) {
    throw new Error("Atom already owned");
  }
  atom._owner = owner;
}

type AtomAccessor<TValue> = (read: Reader) => TValue;

function receive<T>(receiveAtom: ReceiveAtom<T>) {
  const receiver = (receiveAtom._receiver ??= createReceiver(
    // new WeakRef(receiveAtom)
    receiveAtom
  ));
  const deferFlag = receiveAtom._flags & ATOM_FLAG_DEFER;
  receiveAtom._flags = deferFlag | ATOM_FLAG_IN_RECEIVE;

  const version = receiver._version;
  const read: Reader = <T>(atom: Atom<T> | ReceiveAtom<T> | AtomAccessor<T>) => {
    if (version !== receiver._version) {
      throw new Error("Attempted to use expired read");
    }
    if (typeof atom === "function") {
      return atom(read);
    }
    if (atom._flags & ATOM_FLAG_IN_RECEIVE) {
      throw new Error("Cannot read atom while it is executing");
    }
    receiver._linkSource(atom);
    const owner = atom._owner;
    if (owner !== undefined) {
      stabilizeReceiveAtom(owner);
      if (deferFlag) {
        if (receiveAtom._depth <= owner._depth) {
          receiveAtom._depth = owner._depth + 1;
        }
      } else if (receiveAtom._depth < owner._depth) {
        receiveAtom._depth = owner._depth;
      }
    }
    if ("_fn" in atom) {
      stabilizeReceiveAtom(atom);
      if (deferFlag) {
        if (receiveAtom._depth <= atom._depth) {
          receiveAtom._depth = atom._depth + 1;
        }
      } else if (receiveAtom._depth < atom._depth) {
        receiveAtom._depth = atom._depth;
      }
    }
    return atom._value;
  };
  if (deferFlag) {
    const prevValue = receiveAtom._value;
    receiveAtom._value = receiveAtom._fn(read);
    if (receiveAtom._value !== prevValue && version !== 0) {
      transmit(receiveAtom);
    }
  } else {
    receiveAtom._value = receiveAtom._fn(read);
  }
  receiveAtom._flags = deferFlag;
}

function disposeReceiver(atom: ReceiveAtom) {
  const receiver = atom._receiver as Receiver | undefined;
  if (receiver === undefined) {
    return;
  }
  atom._receiver = undefined;
  receiver._version++;
  receiver._transmitAtom = undefined;
  receiver._sourceTail = undefined;
  receiver._scheduleCleaning();
  // Likely bad perf if used with DEFER atoms or if deeper consumer atoms are weak themselves
  // because it will still propagate down the tree, where as with only non-DEFER and strong atoms,
  // they can be disposed in deep -> shallow order and since no receive happens in that disposal cascade
  // the last atoms to be disposed have nothing to propagate too.
  ///
  // In either case if DEFER flag this should be insertIntoHeap instead of transmit 
  // transmit(atom);

  // An alternative could be to destroy the atom so it cannot be revived
  // would be as simple as adding a DESTROYED flag
  // This may be the way to go...
  // Or possibly it's okay to allow revive it, without transmitting/heaping when it gets disposed
  //
  // An issue with either of these alternatives is it would allow weak receivers to be hijacked and forced to break
  // by any part of the program that chooses to, by simply managing then disposing.
  //
  // Perhaps only specific kinds of atoms can be managed, and must be managed first before they become functional.
  // This would be paired with the DESTROYED flag approach, rather than allowing revives.
  // Maybe also taking an approach like Preact where effects (managed atoms in this case)
  // trigger strongly holding all up stream sources
  //
  // Or all source -> consumer links are always weak
}

let minHeap = Infinity;
let maxHeap = 0;
let nextMaxHeap = -1;
const fallbackHeap: ReceiveAtom[] = [];
const stabilizeHeaps: (ReceiveAtom[] | undefined)[] = new Array(200);

function insertIntoHeap(atom: ReceiveAtom) {
  const flags = atom._flags;
  if (flags & (ATOM_FLAG_IN_HEAP | ATOM_FLAG_IN_RECEIVE)) return;
  atom._flags = (flags & ATOM_FLAG_NON_HEAP) | ATOM_FLAG_IN_HEAP;
  const depth = atom._depth;
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

function moveHeap(atom: ReceiveAtom) {
  const depth = atom._depth;
  (stabilizeHeaps[depth] ??= []).push(atom);
  if (depth > maxHeap) {
    maxHeap = depth;
  } else if (depth <= minHeap) {
    nextMaxHeap = depth;
  }
}

function moveToFallbackHeap(atom: ReceiveAtom) {
  const flags = atom._flags;
  if (flags & ATOM_FLAG_IN_FALLBACK_HEAP) return;
  atom._flags = (flags & ATOM_FLAG_NON_HEAP) | ATOM_FLAG_IN_FALLBACK_HEAP;
  fallbackHeap.push(atom);
}

// function deleteFromHeap(atom: ReceiveAtom) {
//   const flags = atom._flags;
//   if (!(flags & ATOM_FLAG_IN_HEAP)) return;
//   heapSize--;
//   atom._flags = flags & ATOM_FLAG_NON_HEAP;
// }

function clearFallbackHeap() {
  for (let i = fallbackHeap.length - 1; i >= 0; i--) {
    const atom = fallbackHeap[i]!;
    atom._flags &= ATOM_FLAG_NON_HEAP;
  }
  fallbackHeap.length = 0;
}

function stabilizeFallback(rootAtom: ReceiveAtom) {
  // console.warn("Stabilize Fallback");
  const linkStack: Link[] = [];
  const receiveStack: ReceiveAtom[] = [];
  let link = rootAtom._receiver!._sourceHead ?? undefined;
  let atom: Atom | ReceiveAtom | undefined;
  while (link) {
    while (link) {
      atom = link.source;
      // TODO fix to allow for owned ReceiveAtom 
      atom = (atom._owner ?? atom) as Atom | ReceiveAtom;
      const next: Link | undefined = link.nextSource ?? undefined;
      if ("_fn" in atom) {
        if (
          atom._depth < minHeap ||
          atom._flags & (ATOM_FLAG_IN_RECEIVE | ATOM_FLAG_IN_FALLBACK_HEAP)
        ) {
          link = next;
          continue;
        }
        if (atom._flags & (ATOM_FLAG_DIRTY | ATOM_FLAG_IN_HEAP)) {
          moveToFallbackHeap(atom);
          receive(atom);
          transmit(atom);
          link = next;
          continue;
        }
        moveToFallbackHeap(atom);
        receiveStack.push(atom);

        link = atom._receiver?._sourceHead;
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
      if (atom._flags & (ATOM_FLAG_DIRTY | ATOM_FLAG_IN_HEAP)) {
        receive(atom);
      } else {
        atom._flags &= ATOM_FLAG_IN_HEAP | ATOM_FLAG_IN_FALLBACK_HEAP;
      }
    }
    receiveStack.length = 0;
  }
  if (rootAtom._flags & (ATOM_FLAG_DIRTY | ATOM_FLAG_IN_HEAP)) {
    receive(rootAtom);
  } else {
    rootAtom._flags &= ATOM_FLAG_IN_HEAP | ATOM_FLAG_IN_FALLBACK_HEAP;
  }
}

function stabilizeReceiveAtom(atom: ReceiveAtom) {
  if (atom._flags & (ATOM_FLAG_DIRTY | ATOM_FLAG_IN_HEAP)) {
    receive(atom);
  } else if (atom._depth >= minHeap && atom._receiver !== undefined) {
    stabilizeFallback(atom);
  }
}

export function stabilize() {
  while (maxHeap >= 0) {
    clearFallbackHeap();
    let heap: ReceiveAtom[] | undefined;
    let atom: ReceiveAtom;
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
        if ((atom._flags & ATOM_FLAG_IN_HEAP)) {
          if (atom._depth === minHeap) {
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

export function clean() {
  const first = dirtyReceiverPool;
  if (first === undefined) {
    return;
  }

  let receiver = first._nextDirty;
  first._nextDirty = undefined;

  if (receiver === first) {
    cleanReceiver(receiver);
    dirtyReceiverPool = undefined;
    return;
  }

  while (receiver !== undefined) {
    cleanReceiver(receiver);

    dirtyReceiverPool = receiver._nextDirty;
    receiver._nextDirty = undefined;
    receiver = dirtyReceiverPool;
  }
}

const disposedHandler = () => { };
export class EmitChannel {
  #queue: Subscription[] = [];
  #errorHandler: (cause: unknown) => undefined;
  #i = 0;
  constructor(errorHandler: (cause: unknown) => undefined) {
    this.#errorHandler = errorHandler;
  }
  subscribe(atom: Atom, handler: () => undefined): Disposer {
    const subHead = atom._subscriptionHead;
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
    atom._subscriptionHead = sub;

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
      this._subscriptionHead = sub.next;
    } else {
      prev.next = sub.next;
    }
  }
}

export type { Atom as StateAtom, ReceiveAtom as DeriveAtom };
export { Atom };

export const state = <T>(initialValue: T) => new Atom<T>(initialValue);
export const derive = <T>(derivation: (read: Reader) => T, isDeferred = false) => new ReceiveAtom<T>(derivation, isDeferred);
export const channel = new EmitChannel(() => { });