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
  reader: Reader | undefined;
  consumer: Receiver;
  source: Atom;
  nextSource: Link | undefined;
  nextConsumer: Link | undefined;
  prevConsumer: Link;
}

interface RecycledLink {
  reader: undefined;
  consumer: undefined;
  source: undefined;
  nextSource: RecycledLink | undefined;
  nextConsumer: undefined;
  prevConsumer: undefined;
}

export interface Disposer {
  (): undefined;
}

export type AtomAccessor<TValue> = (read: Reader) => TValue;

export interface Reader {
  // <T extends Atom>(readable: T): T extends { unwrap(): infer U } ? U : never;
  <T>(readable: Atom<T> | AtomAccessor<T>): T;
}

const ATOM_FLAG_DEFER = 1;
const ATOM_FLAG_DIRTY = 1 << 1;
const ATOM_FLAG_IN_HEAP = 1 << 2;
const ATOM_FLAG_IN_FALLBACK_HEAP = 1 << 3;
const ATOM_FLAG_IN_RECEIVE = 1 << 4;

const ATOM_FLAG_NON_HEAP = ATOM_FLAG_DEFER | ATOM_FLAG_DIRTY | ATOM_FLAG_IN_RECEIVE;

class Receiver {
  reader: Reader | undefined;
  sourceHead: Link | undefined;
  sourceTail: Link | undefined;
  transmitAtom: WeakRef<ReceiverAtom> | undefined;
  nextDirty: Receiver | undefined;
  constructor(atom: WeakRef<ReceiverAtom>) {
    this.transmitAtom = atom;
  }
}

interface ISubscription {
  run(): undefined;
  dispose(): undefined;
}

let transmitStack: Link[] = [];
let minHeap = Infinity;
let maxHeap = 0;
let nextMaxHeap = -1;
const fallbackHeap: ReceiverAtom[] = [];
const stabilizeHeaps: (ReceiverAtom[] | undefined)[] = new Array(200);

let recycledLinkPool: RecycledLink | undefined;
let dirtyReceiverPool: Receiver | undefined;
let recycledReceiverPool: Receiver | undefined;

let linkSource: (receiver: Receiver, source: Atom) => undefined;
let stabilizeOwner: (atom: Atom) => undefined;
let stabilizeReceiverAtom: (atom: ReceiverAtom) => undefined;
let cleanReceiver: (receiver: Receiver) => undefined;
let emit: (atom: Atom) => undefined;
let transmit: (atom: Atom) => undefined;
let getOwner: (atom: Atom) => ReceiverAtom | undefined;
let attachOwner: (atom: Atom, owner: ReceiverAtom) => undefined;
let insertIntoHeap: (atom: ReceiverAtom) => undefined;
let moveHeap: (atom: ReceiverAtom) => undefined;
let moveToFallbackHeap: (atom: ReceiverAtom) => undefined;
let isDeferred: (atom: ReceiverAtom) => 0 | typeof ATOM_FLAG_DEFER;
let markDirty: (atom: ReceiverAtom) => undefined;
let _stabilize: () => undefined;

function receiverScheduleCleaning(receiver: Receiver) {
  if (receiver.nextDirty !== undefined) {
    // Already scheduled
    return;
  }
  const sourcesTail = receiver.sourceTail;
  if (
    (sourcesTail !== undefined
      ? sourcesTail.nextSource
      : receiver.sourceHead) !== undefined
  ) {
    receiver.nextDirty = dirtyReceiverPool ?? receiver;
    dirtyReceiverPool = receiver;
  }
}

function createReceiver(atom: WeakRef<ReceiverAtom>): Receiver {
  if (recycledReceiverPool === undefined) {
    return new Receiver(atom);
  }
  const receiver = recycledReceiverPool;
  recycledReceiverPool = recycledReceiverPool.nextDirty;
  receiver.transmitAtom = atom;
  receiver.nextDirty = undefined;
  return receiver;
}


const disposedHandler = () => { };

abstract class Atom<TValue = unknown> {
  #owner: ReceiverAtom | undefined;
  #consumerHead: Link | undefined;
  #subscriptionHead: ISubscription | undefined;
  abstract unwrap(): TValue;
  static {
    linkSource = function linkSource(receiver, source): undefined {
      const tail = receiver.sourceTail;
      let nextOld: Link | undefined;
      if (tail !== undefined) {
        if (tail.source === source) {
          return;
        }
        nextOld = tail.nextSource;
      } else {
        nextOld = receiver.sourceHead;
      }

      if (nextOld !== undefined && nextOld.source === source) {
        nextOld.reader = receiver.reader;
        nextOld.consumer = receiver;
        receiver.sourceTail = nextOld;
        return;
      }

      let link: Link;
      if (recycledLinkPool === undefined) {
        link = {
          reader: receiver.reader,
          source,
          consumer: receiver,
          nextSource: nextOld,
          nextConsumer: undefined,
          prevConsumer: undefined as any,
        };
      } else {
        link = recycledLinkPool as any;
        recycledLinkPool = recycledLinkPool.nextSource;
        link.consumer = receiver;
        link.source = source;
        link.nextSource = nextOld;
        link.reader = receiver.reader;
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
        receiver.sourceHead = link;
      } else {
        tail.nextSource = link;
      }
      receiver.sourceTail = link;
    }
    cleanReceiver = function cleanReceiver(receiver): undefined {
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
          receiver.transmitAtom === undefined
        ) {
          receiver.nextDirty = recycledReceiverPool;
          recycledReceiverPool = receiver;
        }
      } else {
        sourcesTail.nextSource = undefined;
      }
    }
    transmit = function transmit(atom): undefined {
      emit(atom);

      let link = atom.#consumerHead;
      let consumer: Receiver;
      let nextConsumerLink: Link | undefined;
      let linkReader: Reader | undefined;

      while (link !== undefined) {
        consumer = link.consumer as Receiver;
        nextConsumerLink = link.nextConsumer;
        linkReader = link.reader;
        consumerHandler: if (consumer.reader === linkReader) {
          const ref = consumer.transmitAtom;
          if (ref === undefined) {
            break consumerHandler;
          }
          const consumerAtom = ref.deref();
          if (consumerAtom === undefined) {
            consumer.reader = undefined;
            consumer.transmitAtom = undefined;
            consumer.sourceTail = undefined;

            break consumerHandler;
          }

          consumer.reader = undefined;
          markDirty(consumerAtom);
          emit(consumerAtom);
          consumer.sourceTail = undefined;
          receiverScheduleCleaning(consumer);

          if (isDeferred(consumerAtom)) {
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
    getOwner = function getOwner(atom) {
      return atom.#owner;
    }
    stabilizeOwner = function stabilizeOwner(atom) {
      const owner = atom.#owner;
      if (owner !== undefined) {
        stabilizeReceiverAtom(owner);
      }
    }
    attachOwner = function attach(atom, owner) {
      if (atom.#owner !== undefined) {
        throw new Error("Atom already owned");
      }
      atom.#owner = owner;
    }
    class Subscription {
      #canQueue = true;
      #atom!: StateAtom;
      #handler!: () => unknown;
      #channelQueue!: Subscription[];
      #next?: Subscription;
      #prev?: Subscription;
      run(): undefined {
        this.#canQueue = false;
        this.#handler();
      }
      dispose(): undefined {
        if (this.#handler === disposedHandler) {
          return;
        }
        this.#canQueue = false;
        this.#handler = disposedHandler;
        if (this.#prev === undefined) {
          this.#atom.#subscriptionHead = this.#next;
        } else {
          this.#prev.#next = this.#next;
        }
      }
      static {
        emit = function emit(atom) {
          let item = atom.#subscriptionHead as (Subscription | undefined);
          while (item !== undefined) {
            if (item.#canQueue) {
              item.#canQueue = false;
              item.#channelQueue.push(item);
            }
            item = item.#next;
          }
        }
        class AtomSubscriptionChannel {
          #queue: Subscription[] = [];
          #errorHandler: (cause: unknown) => undefined;
          #i = 0;
          constructor(errorHandler: (cause: unknown) => undefined) {
            this.#errorHandler = errorHandler;
          }
          subscribe(atom: StateAtom, handler: () => unknown) {
            const sub = new Subscription();
            sub.#atom = atom;
            sub.#handler = handler;
            sub.#channelQueue = this.#queue;
            const subHead = atom.#subscriptionHead as Subscription;
            sub.#next = subHead;
            if (subHead !== undefined) {
              subHead.#prev = sub;
            }
            atom.#subscriptionHead = sub;
            return sub;
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
      }
    }
  }
}

class ReceiverAtom<TValue = unknown> extends Atom<TValue> {
  #flags;
  #value: TValue | undefined;
  #fn: (read: Reader) => TValue;
  #depth = -1;
  #receiver: Receiver | undefined;
  constructor(fn: (read: Reader) => TValue, isDeferred = false) {
    super();
    if (isDeferred) {
      this.#depth = 0;
      this.#flags = ATOM_FLAG_DIRTY | ATOM_FLAG_DEFER;
    } else {
      this.#flags = ATOM_FLAG_DIRTY;
    }
    this.#fn = fn;
  }
  override unwrap(): TValue {
    stabilizeReceiverAtom(this);
    return this.#value as TValue;
  }
  static {
    isDeferred = function isDeferred(atom) {
      return (atom.#flags & ATOM_FLAG_DEFER) as (0 | typeof ATOM_FLAG_DEFER);
    }

    markDirty = function markDirty(atom) {
      atom.#flags |= ATOM_FLAG_DIRTY;
    }

    function receive<T>(receiveAtom: ReceiverAtom<T>) {
      const receiver = (receiveAtom.#receiver ??= createReceiver(
        new WeakRef(receiveAtom)
      ));
      const deferFlag = receiveAtom.#flags & ATOM_FLAG_DEFER;
      receiveAtom.#flags = deferFlag | ATOM_FLAG_IN_RECEIVE;

      const read = receiver.reader = <T>(atom: Atom<T> | AtomAccessor<T>): T => {
        if (read !== receiver.reader) {
          throw new Error("Attempted to use expired read");
        }
        if (typeof atom === "function") {
          return atom(read);
        }
        if (#fn in atom) {
          if (atom.#flags & ATOM_FLAG_IN_RECEIVE) {
            throw new Error("Cannot read atom while it is executing");
          }
          linkSource(receiver, atom);
          stabilizeReceiverAtom(atom);
          if (deferFlag) {
            if (receiveAtom.#depth <= atom.#depth) {
              receiveAtom.#depth = atom.#depth + 1;
            }
          } else if (receiveAtom.#depth < atom.#depth) {
            receiveAtom.#depth = atom.#depth;
          }
          return atom.#value as T;
        }
        linkSource(receiver, atom);
        const value = atom.unwrap();
        const owner = getOwner(atom);
        if (owner !== undefined) {
          if (deferFlag) {
            if (receiveAtom.#depth <= owner.#depth) {
              receiveAtom.#depth = owner.#depth + 1;
            }
          } else if (receiveAtom.#depth < owner.#depth) {
            receiveAtom.#depth = owner.#depth;
          }
        }

        return value;
      };

      if (deferFlag) {
        const prevValue = receiveAtom.#value;
        receiveAtom.#value = receiveAtom.#fn(read);
        // TODO is this correct? Does it need to be limited to non-init receive?
        if (receiveAtom.#value !== prevValue) {
          transmit(receiveAtom);
        }
      } else {
        receiveAtom.#value = receiveAtom.#fn(read);
      }
      receiveAtom.#flags = deferFlag;
    }

    function stabilizeFallback(rootAtom: ReceiverAtom) {
      // console.error(new Error("Hit Fallback"));
      const linkStack: Link[] = [];
      const receiveStack: ReceiverAtom[] = [];
      let link = rootAtom.#receiver!.sourceHead ?? undefined;
      let atom: Atom | undefined;
      while (link) {
        while (link) {
          atom = link.source;
          // TODO fix to allow for owned ReceiveAtom 
          atom = getOwner(atom) ?? atom;
          const next: Link | undefined = link.nextSource ?? undefined;
          if (#fn in atom) {
            if (
              atom.#depth < minHeap ||
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

            link = atom.#receiver?.sourceHead;
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

    stabilizeReceiverAtom = function stabilizeReceiverAtom(atom) {
      stabilizeOwner(atom);
      if (atom.#flags & (ATOM_FLAG_DIRTY | ATOM_FLAG_IN_HEAP)) {
        receive(atom);
      } else if (atom.#depth >= minHeap && atom.#receiver !== undefined) {
        stabilizeFallback(atom);
      }
    }

    insertIntoHeap = function insertIntoHeap(atom) {
      const flags = atom.#flags;
      if (flags & (ATOM_FLAG_IN_HEAP | ATOM_FLAG_IN_RECEIVE)) return;
      atom.#flags = (flags & ATOM_FLAG_NON_HEAP) | ATOM_FLAG_IN_HEAP;
      const depth = atom.#depth;
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

    moveHeap = function moveHeap(atom) {
      const depth = atom.#depth;
      (stabilizeHeaps[depth] ??= []).push(atom);
      if (depth > maxHeap) {
        maxHeap = depth;
      } else if (depth <= minHeap) {
        nextMaxHeap = depth;
      }
    }

    moveToFallbackHeap = function moveToFallbackHeap(atom) {
      const flags = atom.#flags;
      if (flags & ATOM_FLAG_IN_FALLBACK_HEAP) return;
      atom.#flags = (flags & ATOM_FLAG_NON_HEAP) | ATOM_FLAG_IN_FALLBACK_HEAP;
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
        atom.#flags &= ATOM_FLAG_NON_HEAP;
      }
      fallbackHeap.length = 0;
    }

    _stabilize = function stabilize() {
      while (maxHeap >= 0) {
        clearFallbackHeap();
        let heap: ReceiverAtom[] | undefined;
        let atom: ReceiverAtom;
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
            if ((atom.#flags & ATOM_FLAG_IN_HEAP)) {
              if (atom.#depth === minHeap) {
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

let setState: <TValue>(this: StateAtom<TValue>, value: TValue) => undefined;

class StateAtom<TValue = unknown> extends Atom<TValue> {
  #value: TValue;
  constructor(value: TValue) {
    super();
    this.#value = value;
  }
  unwrap(): TValue {
    stabilizeOwner(this);
    return this.#value;
  }
  static {
    setState = function setState(value) {
      if (this.#value === value) {
        return;
      }
      this.#value = value;
      transmit(this);
    }
  }
  static createController() {

  }
  static createWithSetter<TValue>(initialValue: TValue) {
    const atom = new this(initialValue);
    return [atom, setState.bind(atom)];
  }
}

export const stabilize = _stabilize;

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

// export type { StateAtom as StateAtom, ReceiveAtom as DeriveAtom };
// export { StateAtom as Atom };

// export const state = <T>(initialValue: T) => new StateAtom<T>(initialValue);
// export const derive = <T>(derivation: (read: Reader) => T, isDeferred = false) => new ReceiveAtom<T>(derivation, isDeferred);
// export const channel = new SubscriptionChannel(() => { });