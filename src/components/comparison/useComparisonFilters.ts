import { useEffect, useState } from "react";
import { replaceWorkspaceHistory } from "@/lib/workspaceHistory";
import { filterKeys, readComparisonFilters, type ComparisonFilters } from "./filters";

export function useComparisonFilters() {
  const [filters, setFilters] = useState(() => readComparisonFilters(window.location.search));
  useEffect(() => {
    const restore = () => setFilters(readComparisonFilters(window.location.search));
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    for (const [key, param] of Object.entries(filterKeys)) {
      const value = filters[key as keyof typeof filterKeys];
      if (value && value !== "all") url.searchParams.set(param, value);
      else url.searchParams.delete(param);
    }
    if (filters.tab !== "compare") url.searchParams.set("comparisonTab", filters.tab);
    else url.searchParams.delete("comparisonTab");
    if (url.href !== window.location.href) replaceWorkspaceHistory(url);
  }, [filters]);
  const update = <K extends keyof ComparisonFilters>(key: K, value: ComparisonFilters[K]) => setFilters(current => ({ ...current, [key]: value }));
  const clear = () => setFilters(current => ({ ...current, query: "", status: "all", owner: "all", severity: "all", category: "all", page: "all" }));
  return { filters, update, clear };
}
