import { useEffect, useState } from "react";
import { replaceWorkspaceHistory } from "@/lib/workspaceHistory";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES } from "./types";
import type { FeedbackFilters } from "./types";
function read(): FeedbackFilters {
  const params = new URLSearchParams(window.location.search);
  const status = params.get("feedbackStatus"); const category = params.get("feedbackCategory");
  return { query: params.get("feedbackSearch") ?? "", status: status && Object.keys(FEEDBACK_STATUSES).includes(status) ? status as FeedbackFilters["status"] : "all",
    owner: params.get("feedbackOwner") ?? "", category: category && Object.keys(FEEDBACK_CATEGORIES).includes(category) ? category as FeedbackFilters["category"] : "all" };
}
export function useFeedbackFilters() {
  const [filters, setFilters] = useState(read);
  useEffect(() => { const restore = () => setFilters(read()); window.addEventListener("popstate", restore); return () => window.removeEventListener("popstate", restore); }, []);
  useEffect(() => {
    const url = new URL(window.location.href);
    const update = (key: string, value: string, fallback = "") => value && value !== fallback ? url.searchParams.set(key, value) : url.searchParams.delete(key);
    update("feedbackSearch", filters.query); update("feedbackStatus", filters.status, "all"); update("feedbackOwner", filters.owner); update("feedbackCategory", filters.category, "all");
    if (url.href !== window.location.href) replaceWorkspaceHistory(url);
  }, [filters]);
  return { filters, setFilter: <K extends keyof FeedbackFilters>(key: K, value: FeedbackFilters[K]) => setFilters(current => ({ ...current, [key]: value })),
    clear: () => setFilters({ query: "", status: "all", owner: "", category: "all" }) };
}
