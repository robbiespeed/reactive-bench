export interface Disposable {
  (): void;
}

export const enum ReactiveFlags {
  None = 0,
  Check = 1 << 0,
  Dirty = 1 << 1,
  RecomputingDeps = 1 << 2,
  InHeap = 1 << 3,
  InHeapHeight = 1 << 4,
}

export interface Link {
  dep: Signal<unknown> | Computed<unknown>;
  sub: Computed<unknown>;
  nextDep: Link | null;
  prevSub: Link | null;
  nextSub: Link | null;
}

export interface RawSignal<T> {
  subs: Link | null;
  subsTail: Link | null;
  value: T;
  error?: unknown;
}

interface FirewallSignal<T> extends RawSignal<T> {
  owner: Computed<unknown>;
  nextChild: FirewallSignal<unknown> | null;
}

export type Signal<T> = RawSignal<T> | FirewallSignal<T>;

const initial = Symbol("INITIAL");
type AsyncSignal<T> = Signal<Promise<T>> & {
  loaded: Signal<T | typeof initial>;
  loading: FirewallSignal<boolean>;
};

export interface Owner {
  disposal: Disposable | Disposable[] | null;
  parent: Owner | null;
  firstChild: Owner | null;
  nextSibling: Owner | null;
}

export interface Computed<T> extends RawSignal<T>, Owner {
  deps: Link | null;
  depsTail: Link | null;
  flags: ReactiveFlags;
  height: number;
  nextHeap: Computed<unknown> | undefined;
  prevHeap: Computed<unknown>;
  fn: () => T;
  child: FirewallSignal<unknown> | null;
}

let markedHeap = false;
let context: Computed<unknown> | null = null;

let minDirty = 0;
let maxDirty = 0;
const dirtyHeap: (Computed<unknown> | undefined)[] = new Array(2000);
export function increaseHeapSize(n: number) {
  if (n > dirtyHeap.length) {
    dirtyHeap.length = n;
  }
}

function actualInsertIntoHeap(n: Computed<unknown>, f: number) {
  const height = n.height;
  const heapAtHeight = dirtyHeap[height];
  if (heapAtHeight === undefined) {
    dirtyHeap[height] = n;
  } else {
    const tail = heapAtHeight.prevHeap;
    tail.nextHeap = n;
    n.prevHeap = tail;
    heapAtHeight.prevHeap = n;
  }
  if (height > maxDirty) {
    maxDirty = height;
  }
}
function insertIntoHeap(n: Computed<unknown>) {
  let flags = n.flags;
  if (
    flags &
    (ReactiveFlags.InHeap |
      ReactiveFlags.RecomputingDeps)
  )
    return;
  if (flags & ReactiveFlags.Check) {
    flags =
      (flags & ~(ReactiveFlags.Check | ReactiveFlags.Dirty)) |
      ReactiveFlags.Dirty;
  }
  n.flags = flags | ReactiveFlags.InHeap;
  if (!(flags & ReactiveFlags.InHeapHeight)) {
    actualInsertIntoHeap(n, flags);
  }
}

function insertIntoHeapHeight(n: Computed<unknown>) {
  let flags = n.flags;
  if (
    flags &
    (ReactiveFlags.InHeap |
      ReactiveFlags.RecomputingDeps |
      ReactiveFlags.InHeapHeight)
  )
    return;
  n.flags = flags | ReactiveFlags.InHeapHeight;
  actualInsertIntoHeap(n, flags);
}

function deleteFromHeap(n: Computed<unknown>) {
  const flags = n.flags;
  if (!(flags & (ReactiveFlags.InHeap | ReactiveFlags.InHeapHeight))) return;
  n.flags = flags & ~(ReactiveFlags.InHeap | ReactiveFlags.InHeapHeight);
  const height = n.height;
  if (n.prevHeap === n) {
    dirtyHeap[height] = undefined;
  } else {
    const next = n.nextHeap;
    const dhh = dirtyHeap[height]!;
    const end = next ?? dhh;
    if (n === dhh) {
      dirtyHeap[height] = next;
    } else {
      n.prevHeap.nextHeap = next;
    }
    end.prevHeap = n.prevHeap;
  }
  n.prevHeap = n;
  n.nextHeap = undefined;
}

export function computed<T>(fn: () => T): Computed<T> {
  const self: Computed<T> = {
    disposal: null,
    fn: fn,
    value: undefined as T,
    height: 0,
    child: null,
    nextHeap: undefined,
    prevHeap: null as any,
    deps: null,
    depsTail: null,
    subs: null,
    subsTail: null,
    parent: context,
    nextSibling: null,
    firstChild: null,
    flags: ReactiveFlags.None,
  };
  self.prevHeap = self;
  if (context) {
    const lastChild = context.firstChild;
    if (lastChild === null) {
      context.firstChild = self;
    } else {
      self.nextSibling = lastChild;
      context.firstChild = self;
    }
    if (context.depsTail === null) {
      self.height = context.height;
      recompute(self);
    } else {
      self.height = context.height + 1;
      insertIntoHeap(self);
    }
  } else {
    recompute(self);
  }

  return self;
}

export function asyncComputed<T>(
  fn: (get: <U>(signal: Signal<U>) => U) => Promise<T>
): AsyncSignal<T> {
  const self: Computed<Promise<T>> & AsyncSignal<T> = {
    disposal: null,
    fn: undefined as any,
    value: undefined as any,
    height: 0,
    child: null,
    nextHeap: undefined,
    prevHeap: null as any,
    loaded: signal(initial),
    loading: null as any,
    deps: null,
    depsTail: null,
    subs: null,
    subsTail: null,
    parent: null,
    nextSibling: null,
    firstChild: null,
    flags: ReactiveFlags.None,
  };
  self.loading = signal(true, self);
  const get = <U>(s: Signal<U>): U => read(s, self);
  self.fn = () => {
    setSignal(self.loading, true); // firewall set
    const p = fn(get);
    p.then((v) => {
      if (self.value === p) {
        setSignal(self.loaded, v);
        setSignal(self.loading, false);
      }
    });
    return p;
  };
  self.prevHeap = self;
  if (context) {
    const lastChild = context.firstChild;
    if (lastChild === null) {
      context.firstChild = self;
    } else {
      self.nextSibling = lastChild;
      context.firstChild = self;
    }
    if (context.depsTail === null) {
      self.height = context.height;
      recompute(self);
    } else {
      self.height = context.height + 1;
      insertIntoHeap(self);
    }
  } else {
    recompute(self);
  }

  return self;
}

export function readUpDefault<T>(x: AsyncSignal<T>, defaultValue: T): T {
  const p = read(x.loaded);
  return p === initial ? defaultValue : p;
}

export function readDownDefault<T>(x: AsyncSignal<T>, defaultValue: T): T {
  return read(x.loading) ? readUpDefault(x, defaultValue) : defaultValue;
}

export function signal<T>(v: T, firewall: Computed<unknown>): FirewallSignal<T>;
export function signal<T>(v: T): Signal<T>;
export function signal<T>(
  v: T,
  firewall: Computed<unknown> | null = null
): Signal<T> {
  if (firewall !== null) {
    return (firewall.child = {
      value: v,
      subs: null,
      subsTail: null,
      owner: firewall,
      nextChild: firewall.child,
    });
  } else {
    return {
      value: v,
      subs: null,
      subsTail: null,
    };
  }
}

function recompute(el: Computed<unknown>) {
  deleteFromHeap(el);
  disposeChildren(el);

  const oldcontext = context;
  context = el;
  el.depsTail = null;
  el.flags = ReactiveFlags.RecomputingDeps;
  let value;
  let oldHeight = el.height;
  try {
    value = el.fn();
    el.error = undefined;
  } catch (e) {
    el.error = e;
  }
  el.flags = ReactiveFlags.None;
  context = oldcontext;

  const depsTail = el.depsTail as Link | null;
  let toRemove = depsTail !== null ? depsTail.nextDep : el.deps;
  if (toRemove !== null) {
    do {
      toRemove = unlinkSubs(toRemove);
    } while (toRemove !== null);
    if (depsTail !== null) {
      depsTail.nextDep = null;
    } else {
      el.deps = null;
    }
  }

  if (value !== el.value) {
    el.value = value;

    for (let s = el.subs; s !== null; s = s.nextSub) {
      insertIntoHeap(s.sub);
    }
  } else if (el.height != oldHeight) {
    for (let s = el.subs; s !== null; s = s.nextSub) {
      insertIntoHeapHeight(s.sub);
    }
  }
}

function updateIfNecessary(el: Computed<unknown>): void {
  if (el.flags & ReactiveFlags.Check) {
    for (let d = el.deps; d; d = d.nextDep) {
      const dep1 = d.dep;
      const dep = ("owner" in dep1 ? dep1.owner : dep1) as Computed<unknown>;
      if ("fn" in dep) {
        updateIfNecessary(dep);
      }
      if (el.flags & ReactiveFlags.Dirty) {
        break;
      }
    }
  }

  if (el.flags & ReactiveFlags.Dirty) {
    recompute(el);
  }

  el.flags = ReactiveFlags.None;
}

// https://github.com/stackblitz/alien-signals/blob/v2.0.3/src/system.ts#L100
function unlinkSubs(link: Link): Link | null {
  const dep = link.dep;
  const nextDep = link.nextDep;
  const nextSub = link.nextSub;
  const prevSub = link.prevSub;
  if (nextSub !== null) {
    nextSub.prevSub = prevSub;
  } else {
    dep.subsTail = prevSub;
  }
  if (prevSub !== null) {
    prevSub.nextSub = nextSub;
  } else {
    dep.subs = nextSub;
  }
  return nextDep;
}

// https://github.com/stackblitz/alien-signals/blob/v2.0.3/src/system.ts#L52
function link(
  dep: Signal<unknown> | Computed<unknown>,
  sub: Computed<unknown>
) {
  const prevDep = sub.depsTail;
  if (prevDep !== null && prevDep.dep === dep) {
    return;
  }
  let nextDep: Link | null = null;
  const isRecomputing = sub.flags & ReactiveFlags.RecomputingDeps;
  if (isRecomputing) {
    nextDep = prevDep !== null ? prevDep.nextDep : sub.deps;
    if (nextDep !== null && nextDep.dep === dep) {
      sub.depsTail = nextDep;
      return;
    }
  }

  const prevSub = dep.subsTail;
  if (
    prevSub !== null &&
    prevSub.sub === sub &&
    (!isRecomputing || isValidLink(prevSub, sub))
  ) {
    return;
  }
  const newLink =
    (sub.depsTail =
      dep.subsTail =
      {
        dep,
        sub,
        nextDep,
        prevSub,
        nextSub: null,
      });
  if (prevDep !== null) {
    prevDep.nextDep = newLink;
  } else {
    sub.deps = newLink;
  }
  if (prevSub !== null) {
    prevSub.nextSub = newLink;
  } else {
    dep.subs = newLink;
  }
}

// https://github.com/stackblitz/alien-signals/blob/v2.0.3/src/system.ts#L284
function isValidLink(checkLink: Link, sub: Computed<unknown>): boolean {
  const depsTail = sub.depsTail;
  if (depsTail !== null) {
    let link = sub.deps!;
    do {
      if (link === checkLink) {
        return true;
      }
      if (link === depsTail) {
        break;
      }
      link = link.nextDep!;
    } while (link !== null);
  }
  return false;
}

export function read<T>(
  el: Signal<T> | Computed<T>,
  c: Computed<unknown> | null = context
): T {
  if (c) {
    link(el, c);

    const owner = "owner" in el ? el.owner : el;
    if ("fn" in owner) {
      if (owner.height >= minDirty) {
        markHeap();
        updateIfNecessary(owner);
      }
      const height = owner.height;
      if (height >= c.height) {
        c.height = height + 1;
      }
    }
  }
  if (el.error) {
    throw el.error;
  }
  return el.value;
}

export function setSignal(el: Signal<unknown>, v: unknown) {
  if (el.value === v) return;
  el.value = v;
  for (let link = el.subs; link !== null; link = link.nextSub) {
    insertIntoHeap(link.sub);
  }
}

function markNode(el: Computed<unknown>, newState = ReactiveFlags.Dirty) {
  const flags = el.flags;
  if ((flags & (ReactiveFlags.Check | ReactiveFlags.Dirty)) >= newState) return;
  el.flags = (flags & ~(ReactiveFlags.Check | ReactiveFlags.Dirty)) | newState;
  for (let link = el.subs; link !== null; link = link.nextSub) {
    markNode(link.sub, ReactiveFlags.Check);
  }
  if (el.child !== null) {
    for (
      let child: FirewallSignal<unknown> | null = el.child;
      child !== null;
      child = child.nextChild
    ) {
      for (let link = child.subs; link !== null; link = link.nextSub) {
        markNode(link.sub, ReactiveFlags.Check);
      }
    }
  }
}

function markHeap() {
  if (markedHeap) return;
  markedHeap = true;
  for (let i = 0; i <= maxDirty; i++) {
    for (let el = dirtyHeap[i]; el !== undefined; el = el.nextHeap) {
      if (el.flags & ReactiveFlags.InHeap) markNode(el);
    }
  }
}

function adjustHeight(el: Computed<unknown>) {
  deleteFromHeap(el);
  let newHeight = el.height;
  for (let d = el.deps; d; d = d.nextDep) {
    const dep1 = d.dep;
    const dep = ("owner" in dep1 ? dep1.owner : dep1) as Computed<unknown>;
    if ("fn" in dep) {
      if (dep.height >= newHeight) {
        newHeight = dep.height + 1;
      }
    }
  }
  if (el.height !== newHeight) {
    el.height = newHeight;
    for (let s = el.subs; s !== null; s = s.nextSub) {
      insertIntoHeapHeight(s.sub);
    }
  }
}

export function stabilize() {
  markedHeap = false;
  for (minDirty = 0; minDirty <= maxDirty; minDirty++) {
    let el = dirtyHeap[minDirty];
    while (el !== undefined) {
      if (el.flags & ReactiveFlags.InHeap) recompute(el);
      else {
        adjustHeight(el);
      }
      el = dirtyHeap[minDirty];
    }
  }
}

export function onCleanup(fn: Disposable): Disposable {
  if (!context) return fn;

  const node = context;

  if (!node.disposal) {
    node.disposal = fn;
  } else if (Array.isArray(node.disposal)) {
    node.disposal.push(fn);
  } else {
    node.disposal = [node.disposal, fn];
  }
  return fn;
}

function disposeChildren(node: Owner): void {
  let child = node.firstChild;
  while (child) {
    const nextChild = child.nextSibling;
    if ((child as Computed<unknown>).deps) {
      const n = child as Computed<unknown>;
      deleteFromHeap(n);
      let toRemove = n.deps;
      do {
        toRemove = unlinkSubs(toRemove!);
      } while (toRemove !== null);
      n.deps = null;
      n.depsTail = null;
      n.flags = ReactiveFlags.None;
    }
    disposeChildren(child);
    child = nextChild;
  }
  node.firstChild = null;
  node.nextSibling = null;
  runDisposal(node);
}

function runDisposal(node: Owner): void {
  if (!node.disposal) return;

  if (Array.isArray(node.disposal)) {
    for (let i = 0; i < node.disposal.length; i++) {
      const callable = node.disposal[i];
      callable!.call(callable);
    }
  } else {
    node.disposal.call(node.disposal);
  }

  node.disposal = null;
}

export function getContext(): Computed<unknown> | null {
  return context;
}

export function runWithOwner<T>(
  owner: Computed<unknown> | null,
  fn: () => T
): T {
  const oldContext = context;
  context = owner;
  try {
    return fn();
  } finally {
    context = oldContext;
  }
}