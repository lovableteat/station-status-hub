const projects = ['A', 'B'].map(id => ({id, name:id, status:'active', is_archived:false, active_flow_version_id:null}));
export const supabase = {
  from(table) {
    const builder = new Proxy({}, {get: (_target, key) => key === 'then'
      ? (resolve, reject) => Promise.resolve({data:table === 'test_projects' ? projects : [], error:null}).then(resolve, reject)
      : () => builder});
    return builder;
  },
  rpc: () => Promise.resolve({data:[], error:null}),
  channel() { const channel = {on(){return channel;}, subscribe(){return channel;}}; return channel; },
  removeChannel: () => Promise.resolve(),
};
