import { useEffect, useState } from "react";
import type { TestPlanFileCategory, TestPlanSort } from "./types";
import { replaceWorkspaceHistory } from "@/lib/workspaceHistory";

const categories = ["all", "presentation", "spreadsheet", "document", "image", "3d", "pcb", "archive", "other"] as const;
const sorts = ["name", "newest", "oldest", "largest", "type"] as const;
function readFilters() {
  const params = new URLSearchParams(window.location.search);
  const category = params.get("fileType");
  const sort = params.get("fileSort");
  return {
    query: params.get("fileSearch") ?? "",
    category: categories.includes(category as typeof categories[number]) ? category as TestPlanFileCategory | "all" : "all" as const,
    sort: sorts.includes(sort as TestPlanSort) ? sort as TestPlanSort : "newest" as const,
  };
}

export function useFileLibraryFilters() {
  const [filters, setFilters] = useState(readFilters);
  useEffect(() => {
    const restore = () => setFilters(readFilters());
    window.addEventListener("popstate", restore);
    return () => window.removeEventListener("popstate", restore);
  }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    const update = (key: string, value: string, fallback: string) => value && value !== fallback ? url.searchParams.set(key, value) : url.searchParams.delete(key);
    update("fileSearch", filters.query, "");
    update("fileType", filters.category, "all");
    update("fileSort", filters.sort, "newest");
    if (url.href !== window.location.href) replaceWorkspaceHistory(url);
  }, [filters]);
  return {
    query: filters.query,
    categoryFilter: filters.category,
    sort: filters.sort,
    setQuery: (query: string) => setFilters(current => ({ ...current, query })),
    setCategoryFilter: (category: TestPlanFileCategory | "all") => setFilters(current => ({ ...current, category })),
    setSort: (sort: TestPlanSort) => setFilters(current => ({ ...current, sort })),
    clearFilters: () => setFilters(current => ({ ...current, query: "", category: "all" })),
  };
}
