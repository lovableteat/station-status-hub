interface PageResult<T, E> {
  data: T[] | null;
  error: E | null;
}

type PageFetcher<T, E> = (
  from: number,
  to: number,
) => PromiseLike<PageResult<T, E>>;

export async function fetchAllPages<T, E = unknown>(
  fetchPage: PageFetcher<T, E>,
  pageSize = 1000,
): Promise<{ data: T[]; error: E | null }> {
  const safePageSize = Math.max(1, Math.trunc(pageSize));
  const data: T[] = [];
  let from = 0;

  while (true) {
    const result = await fetchPage(from, from + safePageSize - 1);
    if (result.error) return { data: [], error: result.error };

    const page = result.data ?? [];
    data.push(...page);
    if (page.length < safePageSize) return { data, error: null };

    from += safePageSize;
  }
}
