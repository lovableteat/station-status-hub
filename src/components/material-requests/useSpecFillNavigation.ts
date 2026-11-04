import { useCallback, useEffect, useRef } from "react";
import { pushWorkspaceHistory, replaceWorkspaceHistory } from "@/lib/workspaceHistory";

const NAVIGATION_STATE_KEY = "station:material-spec-fill";
type SpecFillView = "pending" | "spec-fill";
interface NavigationMarker {
  version: 1;
  scopeKey: string;
  token: string;
  view: SpecFillView;
}
interface NavigationSession {
  scopeKey: string;
  token: string;
  path: string;
  view: SpecFillView;
}

function stateRecord(state: unknown): Record<string, unknown> {
  return state && typeof state === "object" && !Array.isArray(state) ? state as Record<string, unknown> : {};
}
function markerFromState(state: unknown): NavigationMarker | null {
  const marker = stateRecord(state)[NAVIGATION_STATE_KEY] as Partial<NavigationMarker> | undefined;
  return marker?.version === 1 && typeof marker.scopeKey === "string" && typeof marker.token === "string"
    && (marker.view === "pending" || marker.view === "spec-fill") ? marker as NavigationMarker : null;
}
function stateWithMarker(state: unknown, marker: NavigationMarker) {
  return { ...stateRecord(state), [NAVIGATION_STATE_KEY]: marker };
}
function stateWithoutMarker(state: unknown) {
  const next = { ...stateRecord(state) };
  delete next[NAVIGATION_STATE_KEY];
  return Object.keys(next).length ? next : null;
}
function currentPath() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}
function replaceMarker(marker: NavigationMarker | null) {
  // Retain every existing history field, including the workspace cursor and any
  // outer router metadata. The workspace helper commits this unchanged URL.
  window.history.replaceState(marker ? stateWithMarker(window.history.state, marker) : stateWithoutMarker(window.history.state), "", window.location.href);
  replaceWorkspaceHistory(window.location.href);
}
let nextSession = 0;

/**
 * Only navigation markers enter browser history. Photos, SPEC files, answers and
 * conversations stay in the scoped, mounted dialog owned by the caller.
 */
export function useSpecFillNavigation({ scopeKey, onOpenSpecFill, onReturnToPending }: {
  scopeKey: string | null;
  onOpenSpecFill: () => void;
  onReturnToPending: () => void;
}) {
  const active = useRef<NavigationSession | null>(null);
  const openedScope = useRef<string | null>(null);
  const latest = useRef({ scopeKey, onOpenSpecFill, onReturnToPending });
  latest.current = { scopeKey, onOpenSpecFill, onReturnToPending };

  useEffect(() => {
    if (openedScope.current !== scopeKey) openedScope.current = null;
    const session = active.current;
    if (session && session.scopeKey !== scopeKey) {
      active.current = null;
      // Remove this session's current marker without moving another account or
      // BOM through history. Older entries remain inert because their token died.
      if (markerFromState(window.history.state)?.token === session.token) replaceMarker(null);
    }
  }, [scopeKey]);
  useEffect(() => {
    const onPop = () => {
      const session = active.current;
      if (!session) return;
      const marker = markerFromState(window.history.state);
      if (session.scopeKey !== latest.current.scopeKey || currentPath() !== session.path
        || marker?.scopeKey !== session.scopeKey || marker.token !== session.token) {
        active.current = null;
        return;
      }
      if (session.view === marker.view) return;
      session.view = marker.view;
      if (marker.view === "pending") {
        openedScope.current = null;
        latest.current.onReturnToPending();
      } else {
        openedScope.current = session.scopeKey;
        latest.current.onOpenSpecFill();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => { active.current = null; openedScope.current = null; window.removeEventListener("popstate", onPop); };
  }, []);

  const openSpecFill = useCallback(() => {
    const current = latest.current;
    if (!current.scopeKey) return;
    const path = currentPath();
    const previous = active.current;
    if (previous?.scopeKey === current.scopeKey && previous.path === path && previous.view === "spec-fill") return;
    const token = `${Date.now().toString(36)}-${(++nextSession).toString(36)}`;
    const pending: NavigationMarker = { version: 1, scopeKey: current.scopeKey, token, view: "pending" };
    active.current = { scopeKey: current.scopeKey, token, path, view: "spec-fill" };
    openedScope.current = current.scopeKey;
    // The workspace history helper is the application's canonical cursor; it
    // preserves the live project/fileSpace URL, which can differ from router state.
    replaceMarker(pending);
    pushWorkspaceHistory(window.location.href);
    replaceMarker({ ...pending, view: "spec-fill" });
    current.onOpenSpecFill();
  }, []);

  const closeSpecFill = useCallback(() => {
    const current = latest.current;
    const session = active.current;
    if (!current.scopeKey || (session && (session.scopeKey !== current.scopeKey || session.view !== "spec-fill"))) return;
    const marker = markerFromState(window.history.state);
    if (session && currentPath() === session.path && marker?.token === session.token && marker.view === "spec-fill") {
      window.history.back();
      return;
    }
    // Another workspace control may update the URL/state while the dialog is
    // open. Close its current UI safely without popping an unrelated entry.
    if (openedScope.current === current.scopeKey) {
      active.current = null;
      openedScope.current = null;
      current.onReturnToPending();
    }
  }, []);

  return { openSpecFill, closeSpecFill };
}
