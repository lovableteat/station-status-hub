import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { EMPTY_WORKSPACE, type Fault, type FaultThread, type FaultWorkspaceData } from './maintenanceModel';

export function useMaintenanceData(projectId: string | null, userId: string | undefined) {
  const [data, setData] = useState<FaultWorkspaceData>(EMPTY_WORKSPACE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const identity = useRef('');
  identity.current = `${projectId}:${userId}`;
  const refresh = useCallback(async () => {
    if (!projectId || !userId) { setLoading(false); return; }
    const key = `${projectId}:${userId}`, request = ++generation.current;
    const result = await supabase.rpc('maintenance_workspace', { p_project_id: projectId });
    if (identity.current !== key || request !== generation.current) return;
    if (result.error) setError(result.error.message);
    else { setData(result.data as unknown as FaultWorkspaceData); setError(''); }
    setLoading(false);
  }, [projectId, userId]);
  useEffect(() => {
    setData(EMPTY_WORKSPACE); setLoading(true); setError('');
    void refresh();
    if (!projectId || !userId) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => void refresh(), 150); };
    const channel = supabase.channel(`maintenance:${projectId}:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'workspace', table: 'issues', filter: `project_id=eq.${projectId}` }, schedule)
      .on('postgres_changes', { event: '*', schema: 'workspace', table: 'maintenance_messages', filter: `project_id=eq.${projectId}` }, schedule)
      .subscribe();
    const catchUp = () => { if (document.visibilityState !== 'hidden') void refresh(); };
    const poll = setInterval(catchUp, 5000);
    window.addEventListener('online', catchUp); window.addEventListener('focus', catchUp); document.addEventListener('visibilitychange', catchUp);
    return () => {
      ++generation.current; clearTimeout(timer); clearInterval(poll); void supabase.removeChannel(channel);
      window.removeEventListener('online', catchUp); window.removeEventListener('focus', catchUp); document.removeEventListener('visibilitychange', catchUp);
    };
  }, [projectId, userId, refresh]);
  return { data, loading, error, refresh };
}

export async function updateFault(issue: Fault, changes: Record<string, Json | undefined>) {
  const { data, error } = await supabase.rpc('maintenance_update_fault', {
    p_issue_id: issue.id, p_expected_updated_at: issue.updated_at, p_changes: changes,
  });
  if (error) throw error;
  return data as unknown as Fault;
}

export function useFaultThread(issue: Fault) {
  const [thread, setThread] = useState<FaultThread>({ messages: [], attachments: [] });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const request = ++generation.current;
    const result = await supabase.rpc('maintenance_thread', { p_issue_id: issue.id });
    if (request !== generation.current) return;
    if (result.error) setError(result.error.message);
    else { setThread(result.data as unknown as FaultThread); setError(''); }
    setLoading(false);
  }, [issue.id]);
  useEffect(() => { void refresh(); return () => { ++generation.current; }; }, [issue.updated_at, refresh]);
  return { thread, loading, error, refresh };
}

export function maintenanceError(error: unknown) {
  return error && typeof error === 'object' && 'message' in error ? String(error.message) : '連線失敗，內容已保留，請重試';
}

export function useMaintenanceViewport() {
  const [viewport, setViewport] = useState({ height: window.innerHeight, bottom: 0 });
  useEffect(() => {
    const visible = window.visualViewport;
    const update = () => {
      const height = visible?.height || window.innerHeight;
      const bottom = Math.max(0, window.innerHeight - height - (visible?.offsetTop || 0));
      setViewport(previous => previous.height === height && previous.bottom === bottom ? previous : { height, bottom });
    };
    update(); visible?.addEventListener('resize', update); visible?.addEventListener('scroll', update); window.addEventListener('resize', update);
    return () => { visible?.removeEventListener('resize', update); visible?.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, []);
  return viewport;
}
