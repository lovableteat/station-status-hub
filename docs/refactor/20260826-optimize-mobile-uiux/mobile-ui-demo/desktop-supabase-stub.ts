const emptyResult = Promise.resolve({ data: null, error: null });

const query = new Proxy(() => query, {
  apply: () => query,
  get: (_target, property) => {
    if (property === "then") return emptyResult.then.bind(emptyResult);
    if (property === "catch") return emptyResult.catch.bind(emptyResult);
    if (property === "finally") return emptyResult.finally.bind(emptyResult);
    return query;
  },
});

export const SUPABASE_URL = "";
export const supabase = new Proxy({}, {
  get: (_target, property) => {
    if (property === "storage") {
      return {
        from: () => ({
          getPublicUrl: () => ({ data: { publicUrl: "" } }),
        }),
      };
    }
    if (property === "auth") {
      return {
        getSession: async () => ({ data: { session: null }, error: null }),
      };
    }
    if (property === "removeChannel") return async () => undefined;
    return query;
  },
});
