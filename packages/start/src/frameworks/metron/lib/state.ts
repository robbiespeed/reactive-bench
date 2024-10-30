import { EMITTER, Atom, ORB } from './atom.js';
import { Emitter, createEmitter } from './emitter.js';
import { Orb, createTransmitterOrb } from './orb.js';
import { emptyFn } from './shared.js';

const { runSettledCallbacks } = Orb;

export class StateAtom<T> extends Atom<T> {
  #orb?: Orb<undefined>;
  #transmit = runSettledCallbacks;
  #emitter?: Emitter;
  #emit = emptyFn;
  #store: T;
  private constructor(initialValue: T) {
    super();
    this.#store = initialValue;
  }
  set(value: T): undefined {
    if (value === this.#store) {
      return;
    }
    this.#store = value;
    this.#emit();
    this.#transmit();
  }
  get [EMITTER](): Emitter {
    let emitter = this.#emitter;
    if (emitter === undefined) {
      const pack = createEmitter();
      this.#emitter = emitter = pack.emitter;
      this.#emit = pack.emit;
    }

    return emitter;
  }
  get [ORB](): Orb {
    const existingNode = this.#orb;
    if (existingNode !== undefined) {
      return existingNode;
    }

    const { orb, transmit } = createTransmitterOrb();
    this.#orb = orb;
    this.#transmit = transmit;

    return orb;
  }
  unwrap(): T {
    return this.#store;
  }
  static create<T>(initialValue: T): StateAtom<T> {
    return new StateAtom(initialValue);
  }
}

export const state = StateAtom.create;
