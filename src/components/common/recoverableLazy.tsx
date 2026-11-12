import { createContext, createElement, lazy, useContext, useState, type ComponentType } from "react";
import { ModuleLoadRecovery } from "./ModuleLoadRecovery";

/** A rejected import must never reach a boundary around an already mounted editor. */
export function recoverableLazy<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
  let resolved: { default: ComponentType<P> } | undefined;
  let pending: Promise<{ default: ComponentType<P> }> | undefined;
  const preload = () => {
    if (!pending) {
      pending = Promise.resolve().then(load).then(module => {
        // Vite may return undefined if another listener prevents preloadError.
        if (!module?.default) throw new Error("Module did not finish loading");
        resolved = module;
        return module;
      }).catch(error => { pending = undefined; throw error; });
    }
    return pending;
  };
  const RetryContext = createContext(() => {});
  function FailedModule() { return <ModuleLoadRecovery onRetry={useContext(RetryContext)} />; }
  const createContent = () => lazy<ComponentType<P>>(() => preload().catch(() => ({ default: FailedModule })));
  // React may discard hooks when an initial render suspends. The initial lazy
  // identity must therefore live outside the component, not in useMemo.
  const initialContent = createContent();
  function RecoverableModule(props: P) {
    const [Content, setContent] = useState(() => resolved?.default ?? initialContent);
    return <RetryContext.Provider value={() => setContent(() => createContent())}>{createElement(Content as ComponentType<P>, props)}</RetryContext.Provider>;
  }
  return Object.assign(RecoverableModule, { preload });
}
