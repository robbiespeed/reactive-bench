import { EmitController, EMITTER } from "#lib/frameworks/metron-o/lib/emitter";
import { ORB, OrbController } from "./orb.js";
import { EMPTY_CACHE, type Atom, type Reader } from "./shared.js";

export class StateAtom<T> implements Atom<T> {
  #emitController: EmitController | undefined;
  #orbController: OrbController | undefined;
  #store: T;
  constructor(initialValue: T) {
    this.#store = initialValue;
  }
  set(value: T): undefined {
    if (value === this.#store) {
      return;
    }
    this.#store = value;
    this.#emitController?.emit();
    this.#orbController?.transmit();
  }
  unwrap(): T {
    return this.#store;
  }
  get [ORB]() {
    return (this.#orbController ??= new OrbController()).orb;
  }
  get [EMITTER]() {
    return (this.#emitController ??= new EmitController()).emitter;
  }
}

export const state = <T>(initialValue: T) => new StateAtom(initialValue);

export class DeriveAtom<T> implements Atom<T> {
  #emitController: EmitController | undefined;
  #orbController!: OrbController;
  #deriveFn: (read: Reader) => T;
  #store: T | typeof EMPTY_CACHE = EMPTY_CACHE;
  constructor(derivation: (read: Reader) => T) {
    this.#orbController = new OrbController();
    this.#orbController.setIntercept(() => {
      if (this.#store === EMPTY_CACHE) {
        return false;
      }
      this.#store = EMPTY_CACHE;
      this.#emitController?.emit();
      return true;
    });
    this.#deriveFn = derivation;
  }
  unwrap(): T {
    if (this.#store !== EMPTY_CACHE) {
      return this.#store;
    }
    this.#store = this.#orbController.receive(this.#deriveFn);
    return this.#store;
  }
  get [ORB]() {
    return this.#orbController.orb;
  }
  get [EMITTER]() {
    return (this.#emitController ??= new EmitController()).emitter;
  }
  manage() {
    return this.#orbController.manage();
  }
}

export const derive = <T>(derivation: (read: Reader) => T) =>
  new DeriveAtom(derivation);
