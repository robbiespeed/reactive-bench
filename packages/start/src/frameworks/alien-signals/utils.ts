import type { Component } from "@reactive-bench/core/component.ts";
import { EffectScope, endBatch, startBatch } from "alien-signals";

export function wrap<TComponent extends Component<any>>(
  Component: TComponent
): TComponent {
  const scope = new EffectScope();
  return ((props) => {
    const controller = scope.run(() => Component(props));
    const innerCleanup = controller.cleanup;
    return {
      ...controller,
      cleanup: () => {
        innerCleanup?.();
        scope.stop();
      },
    };
  }) as TComponent;
}

export function wrapDefer<TComponent extends Component<any>>(
  Component: TComponent
): TComponent {
  const scope = new EffectScope();
  return ((props) => {
    const controller = scope.run(() => Component(props));
    const innerCleanup = controller.cleanup;
    const innerRunDeferred = controller.runDeferred;
    startBatch();
    return {
      ...controller,
      cleanup: () => {
        innerCleanup?.();
        scope.stop();
      },
      runDeferred: (): undefined => {
        innerRunDeferred?.();
        endBatch();
        startBatch();
      },
    };
  }) as TComponent;
}
