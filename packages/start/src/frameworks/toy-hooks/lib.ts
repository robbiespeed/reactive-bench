let activeNode: Node;

interface Node<TProps = unknown> {
  __IS_NODE: true,
  fn: (props: TProps) => unknown,
  props: TProps,
  output: any,
  isFresh: boolean,
  queuedEffects: undefined | any[],
  states: undefined | any[],
  stateIndex: 0,
}

export function createNode<TProps>(fn: (props: TProps) => unknown, props: TProps): Node<any> {
  return {
    __IS_NODE: true,
    fn,
    props,
    output: undefined,
    isFresh: true,
    queuedEffects: undefined,
    states: undefined,
    stateIndex: 0,
  };
}

function updateOrRunNode(nextNode: Node, prevMaybeNode: any): boolean {
  if (prevMaybeNode?.__IS_NODE && prevMaybeNode.fn === nextNode.fn) {
    nextNode.states = prevMaybeNode.states ? [...prevMaybeNode.states] : [];
    nextNode.isFresh = false;
  }
  const shouldClearPrevNode = nextNode.isFresh && prevMaybeNode?.__IS_NODE;
  activeNode = nextNode;
  runActiveNode();
  return shouldClearPrevNode;
}

export function clearNode(node: Node) {
  const prevOutput = node.output;
  if (Array.isArray(prevOutput)) {
    for (let i = 0; i < prevOutput.length; i++) {
      const prevChild = prevOutput[i];
      if (prevChild?.__IS_NODE) {
        clearNode(prevChild);
      }
    }
  }
  if (node.queuedEffects?.length) {
    for (const effect of node.queuedEffects) {
      effect.cleanup?.();
    }
  }
  node.queuedEffects = undefined;
}

function runActiveNode() {
  const node = activeNode;
  const prevOutput = node.output;
  const nextOutput = node.fn(node.props) as any;
  node.isFresh = false;
  node.stateIndex = 0;
  node.output = nextOutput;
  let shouldClearPrevNode = false;
  if ((nextOutput)?.__IS_NODE) {
    shouldClearPrevNode = updateOrRunNode(nextOutput, prevOutput);
  } else if (Array.isArray(nextOutput)) {
    if (Array.isArray(prevOutput)) {
      for (let i = 0; i < nextOutput.length; i++) {
        const nextChild = nextOutput[i];
        const prevChild = prevOutput[i];
        if (nextChild?.__IS_NODE) {
          if (updateOrRunNode(nextChild, prevChild)) {
            clearNode(prevChild);
          }
        } else if (prevChild?.__IS_NODE) {
          clearNode(prevChild);
        }
      }
    } else {
      for (let i = 0; i < nextOutput.length; i++) {
        const nextChild = nextOutput[i];
        if (nextChild?.__IS_NODE) {
          activeNode = nextChild;
          runActiveNode();
        }
      }
      shouldClearPrevNode = prevOutput?.__IS_NODE;
    }
  }
  if (shouldClearPrevNode) {
    clearNode(prevOutput);
  }

  if (node.queuedEffects?.length) {
    for (const effect of node.queuedEffects) {
      effect.cleanup?.();
      effect.cleanup = effect.fn();
    }
  }
  node.queuedEffects = undefined;
}

export function runNode(node: Node) {
  const prevActiveNode = activeNode;
  activeNode = node;
  runActiveNode();
  activeNode = prevActiveNode;
}

function createSetState(node: Node, index: number) {
  return (value: any) => {
    let state;
    if (typeof value === 'function') {
      state = value(node.states![index]);
    } else {
      state = value;
    }
    node.states![index] = state;
    runNode(node);
  };
}

export function useState<TValue>(initialValue: TValue | (() => TValue)): [TValue, (v: TValue | ((v: TValue) => TValue)) => void] {
  const states = (activeNode.states ??= []);
  let state;
  if (activeNode.isFresh) {
    if (typeof initialValue === 'function') {
      state = (initialValue as any)();
    } else {
      state = initialValue;
    }
    states[activeNode.stateIndex] = state;
  } else {
    state = states[activeNode.stateIndex];
  }
  const setState = createSetState(activeNode, activeNode.stateIndex);
  activeNode.stateIndex++;

  return [state, setState];
}

export function useRef<TValue>(initialValue: TValue): { current: TValue } {
  const states = (activeNode.states ??= []);
  let ref;
  if (activeNode.isFresh) {
    ref = { current: initialValue };
    states[activeNode.stateIndex] = ref;
  } else {
    ref = states[activeNode.stateIndex];
  }
  activeNode.stateIndex++;

  return ref;
}

function checkDepsChange(prevDeps: any[], nextDeps: any[]) {
  return !(
    prevDeps.length === nextDeps.length &&
    prevDeps.every((d, i) => Object.is(d, nextDeps[i]))
  );
}

export function useMemo<TValue>(fn: () => TValue, deps: any[] = []): TValue {
  const states = (activeNode.states ??= []);
  if (activeNode.isFresh) {
    const value = fn();
    states[activeNode.stateIndex] = { value, deps };
    activeNode.stateIndex++;
    return value;
  }

  const memo = states[activeNode.stateIndex];
  activeNode.stateIndex++;

  if (checkDepsChange(memo.deps, deps)) {
    memo.value = fn();
  }

  return memo.value;
}

export function useEffect(fn: (() => void) | (() => (() => void)), deps: any[] = []) {
  const states = (activeNode.states ??= []);
  if (activeNode.isFresh) {
    const effect = { fn, cleanup: undefined, deps };
    states[activeNode.stateIndex] = effect;
    activeNode.stateIndex++;
    activeNode.queuedEffects ??= [];
    activeNode.queuedEffects.push(effect);
    return;
  }

  const effect = states[activeNode.stateIndex];
  effect.fn = fn;
  activeNode.stateIndex++;

  if (checkDepsChange(effect.deps, deps)) {
    effect.deps = deps;
    activeNode.queuedEffects ??= [];
    activeNode.queuedEffects.push(effect);
  }
}
