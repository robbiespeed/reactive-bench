import type { ORB, Orb } from "#lib/frameworks/metron-o/lib/orb";
import type { Emittable } from "#lib/frameworks/metron-o/lib/emitter";

export interface Disposer {
  (): void;
}

export interface ReadableFn<T> {
  (read: Reader): T;
}

export interface Atom<T> extends Emittable {
  unwrap(): T;
  [ORB]: Orb;
}

export type Readable<T> = ReadableFn<T> | Atom<T>;

export interface Reader {
  <T>(readable: Readable<T>): T;
}

export const EMPTY_CACHE = Symbol();
export const NOOP = (): undefined => {};
