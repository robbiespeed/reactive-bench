import type { Emitter } from "./emitter.js";
import type { Orb } from "./orb.js";

export const EMITTER = Symbol("Emitter");
export const ORB = Symbol("Orb");
export const IS_ATOM = Symbol("Atom");

export abstract class Atom<TValue> {
  abstract readonly [ORB]: Orb;
  abstract readonly [EMITTER]: Emitter;
  get [IS_ATOM](): true {
    return true;
  }
  abstract unwrap(): TValue;
  // read(receiver: Orb): TValue {
  //   const value = this.unwrap();
  //   this[ORB].linkReceiver(receiver);
  //   return value;
  // }
}

export interface AtomReader {
  <T>(atom: Atom<T>): T;
}

export type ExtractAtomValue<T> = T extends Atom<infer U> ? U : undefined;
export type ExtractAtomArrayValues<T extends readonly Atom<unknown>[]> = [
  ...{
    [K in keyof T]: ExtractAtomValue<T[K]>;
  }
];

type Primitive = symbol | string | number | bigint | boolean | undefined | null;

interface AntiAtom {
  [IS_ATOM]?: never;
}

export type NonAtom = AntiAtom | Primitive;
export type AtomOrNonAtom = Atom<unknown> | NonAtom;

export function isAtom(value: {}): value is Atom<unknown> {
  return (value as { [IS_ATOM]?: unknown })[IS_ATOM] === true;
}
