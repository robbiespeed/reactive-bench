export interface Disposable {
  (): void;
}

export const enum ReactiveFlags {
  None = 0,
  Dirty = 1 << 0,
  RecomputingDeps = 1 << 1,
  InHeap = 1 << 2,
  InFallbackHeap = 1 << 3,
}

const NonHeapFlags = ReactiveFlags.Dirty | ReactiveFlags.RecomputingDeps;

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
}

interface FirewallSignal<T> extends RawSignal<T> {
  owner: Computed<unknown>;
}

export type Signal<T> = RawSignal<T> | FirewallSignal<T>;

export interface Computed<T> extends RawSignal<T> {
  deps: Link | null;
  depsTail: Link | null;
  flags: ReactiveFlags;
  context: Computed<unknown> | null;
  height: number;
  disposal: Disposable | Disposable[] | null;
  fn: () => T;
}

let context: Computed<unknown> | null = null;

let minDirty = Infinity;
let maxDirty = 0;
let nextMaxDirty = 0;
let contextHeight = 0;
let heapSize = 0;
let fallbackHeap: Computed<unknown>[] = [];
const dirtyHeap: (Computed<unknown>[] | undefined)[] = new Array(2000);
export function increaseHeapSize(n: number) {
  if (n > dirtyHeap.length) {
    dirtyHeap.length = n;
  }
}

function insertIntoHeap(n: Computed<unknown>) {
  let flags = n.flags;
  if (flags & (ReactiveFlags.InHeap | ReactiveFlags.RecomputingDeps)) return;
  heapSize++;
  n.flags = (flags & NonHeapFlags) | ReactiveFlags.InHeap;
  const height = n.height;
  (dirtyHeap[height] ??= []).push(n);
  if (height > maxDirty) {
    maxDirty = height;
  } else if (height <= minDirty) {
    nextMaxDirty = height;
  }
}

function moveToFallbackHeap(n: Computed<unknown>) {
  const flags = n.flags;
  if (flags & ReactiveFlags.InFallbackHeap) return;
  n.flags = (flags & NonHeapFlags) | ReactiveFlags.InFallbackHeap;
  fallbackHeap.push(n);
}

function deleteFromHeap(n: Computed<unknown>) {
  const flags = n.flags;
  if (!(flags & ReactiveFlags.InHeap)) return;
  heapSize--;
  n.flags = flags & NonHeapFlags;
}

export function computed<T>(fn: () => T, isEager = false): Computed<T> {
  const self: Computed<T> = {
    disposal: null,
    fn: fn,
    value: undefined as T,
    height: 0,
    deps: null,
    depsTail: null,
    subs: null,
    subsTail: null,
    flags: ReactiveFlags.Dirty,
    context,
  };
  if (context) {
    self.height = contextHeight + 1;
    link(self, context);
  }
  if (isEager) {
    insertIntoHeap(self);
  }
  return self;
}

export function signal<T>(
  v: T,
  firewall: Computed<unknown> | null = null,
): Signal<T> {
  if (firewall !== null) {
    return {
      value: v,
      subs: null,
      subsTail: null,
      owner: firewall,
    };
  } else {
    return {
      value: v,
      subs: null,
      subsTail: null,
    };
  }
}

function recompute(el: Computed<unknown>) {
  runDisposal(el);
  const oldContext = context;
  const oldWorkingHeight = contextHeight;
  contextHeight = el.context ? el.context.height + 1 : 0;
  context = el;
  el.depsTail = null;
  if (el.flags & ReactiveFlags.InHeap) {
    heapSize--;
  }
  el.flags = NonHeapFlags;
  let didNotError = true;
  let value;
  try {
    value = el.fn();
  } catch (cause) {
    // console.error(cause);
    didNotError = false;
  }
  if (el.height < contextHeight) {
    el.height = contextHeight;
    if (el.flags & ReactiveFlags.InHeap) {
      (dirtyHeap[contextHeight] ??= []).push(el);
    }
  }
  el.flags &= ReactiveFlags.InHeap | ReactiveFlags.InFallbackHeap;
  context = oldContext;
  contextHeight = oldWorkingHeight;

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
    if (didNotError) {
      el.value = value;
    }

    for (let s = el.subs; s !== null; s = s.nextSub) {
      insertIntoHeap(s.sub);
    }
  }
}

function updateIfNecessary(el: Computed<unknown>): void {
  const linkStack: Link[] = [];
  const computeStack: Computed<unknown>[] = [];
  let link = el.deps ?? undefined;
  let node: Signal<unknown> | Computed<unknown> | undefined;
  while (link) {
    while (link) {
      node = link.dep;
      node = ("owner" in node ? node.owner : node) as Computed<unknown> | RawSignal<unknown>;
      const next: Link | undefined = link.nextDep ?? undefined;
      if ("fn" in node) {
        if (
          node.height < minDirty ||
          node.flags & (ReactiveFlags.RecomputingDeps | ReactiveFlags.InFallbackHeap)
        ) {
          link = next;
          continue;
        }
        if (node.flags & (ReactiveFlags.Dirty | ReactiveFlags.InHeap)) {
          moveToFallbackHeap(node);
          recompute(node);
          link = next;
          continue;
        }
        moveToFallbackHeap(node);
        computeStack.push(node);

        if (node.deps) {
          link = node.deps;
          if (next) {
            linkStack.push(next);
          }
          continue;
        }
      }
      link = next;
    }
    link = linkStack.pop();
    for (let i = computeStack.length - 1; i >= 0; i--) {
      const node = computeStack[i]!;
      if (node.flags & (ReactiveFlags.Dirty | ReactiveFlags.InHeap)) {
        recompute(node);
      } else {
        node.flags &= ReactiveFlags.InHeap | ReactiveFlags.InFallbackHeap;
      }
    }
    computeStack.length = 0;
  }
  if (el.flags & (ReactiveFlags.Dirty | ReactiveFlags.InHeap)) {
    recompute(el);
  } else {
    el.flags &= ReactiveFlags.InHeap | ReactiveFlags.InFallbackHeap;
  }
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
    if (nextSub === null && "fn" in dep) {
      unwatched(dep);
    }
  }
  return nextDep;
}

function unwatched(el: Computed<unknown>) {
  deleteFromHeap(el);
  let dep = el.deps;
  while (dep !== null) {
    dep = unlinkSubs(dep);
  }
  el.deps = null;
  runDisposal(el);
}

// https://github.com/stackblitz/alien-signals/blob/v2.0.3/src/system.ts#L52
function link(
  dep: Signal<unknown> | Computed<unknown>,
  sub: Computed<unknown>,
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

export function read<T>(el: Signal<T> | Computed<T>): T {
  if (context) {
    link(el, context);
  }
  const owner = "owner" in el ? el.owner : el;
  if ("fn" in owner) {
    if (owner.flags & (ReactiveFlags.Dirty | ReactiveFlags.InHeap)) {
      recompute(owner);
    } else if (
      heapSize > 0 &&
      owner.height >= minDirty
    ) {
      updateIfNecessary(owner);
    }
    if (context) {
      const height = owner.height;
      if (height >= contextHeight) {
        contextHeight = height + 1;
      }
    }
  }
  return el.value;
}

// Is the fallback heap actually worth it?
// The alternative is that unstable reads simply walk their source tree
// stopping at dirty or heaped nodes

const NonFallbackFlags = ReactiveFlags.Dirty | ReactiveFlags.RecomputingDeps | ReactiveFlags.InHeap;

function clearFallbackHeap() {
  for (let i = fallbackHeap.length - 1; i >= 0; i--) {
    const node = fallbackHeap[i]!;
    node.flags = node.flags & NonFallbackFlags;
  }
  fallbackHeap.length = 0;
}

export function setSignal(el: Signal<unknown>, v: unknown) {
  if (el.value === v) return;
  el.value = v;
  for (let link = el.subs; link !== null; link = link.nextSub) {
    insertIntoHeap(link.sub);
  }
  clearFallbackHeap();
}

export function stabilize() {
  if (!heapSize) {
    return;
  }
  let heap: Computed<any>[];
  let el: Computed<any>;
  for (minDirty = 0; minDirty <= maxDirty; minDirty++) {
    heap = dirtyHeap[minDirty]!;
    for (let i = 0; i < heap.length; i++) {
      el = heap[i]!;
      if ((el.flags & ReactiveFlags.InHeap) && el.height === minDirty) {
        recompute(el);
      }
    }
    heap.length = 0;
  }
  clearFallbackHeap();
  minDirty = Infinity;
  maxDirty = nextMaxDirty;
  nextMaxDirty = 0;
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

function runDisposal(node: Computed<unknown>): void {
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