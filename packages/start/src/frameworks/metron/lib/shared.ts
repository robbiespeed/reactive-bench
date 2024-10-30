export interface Disposer {
  (): void;
}

export const emptyFn = (): undefined => {};

/**
 * @experimental
 */
export class ExpiredReadError extends Error {
  constructor() {
    super('Expired read context');
  }
}
