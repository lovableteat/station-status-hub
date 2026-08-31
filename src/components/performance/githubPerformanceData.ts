export const DEMO_REPOSITORY = {
  owner: "lovableteat",
  name: "demo-repository",
  url: "https://github.com/lovableteat/demo-repository",
} as const;

export interface GithubCommitActivity {
  sha: string;
  shortSha: string;
  message: string;
  authorName: string;
  authorLogin: string;
  authoredAt: string;
  url: string;
}

export interface GithubWorkflowActivity {
  id: number;
  name: string;
  path: string;
  state: string;
  url: string;
}

export interface GithubRepositorySnapshot {
  source: "live" | "cached";
  fullName: string;
  description: string;
  htmlUrl: string;
  defaultBranch: string;
  language: string | null;
  stars: number;
  forks: number;
  openIssues: number;
  updatedAt: string;
  pushedAt: string | null;
  commits: GithubCommitActivity[];
  workflows: GithubWorkflowActivity[];
}

// The repository is currently returning 404 from GitHub's public API. This is
// the last verified snapshot from the cloned repository, kept as a transparent
// fallback so the appraisal workflow remains usable until the API is restored.
export const DEMO_REPOSITORY_CACHED_SNAPSHOT: GithubRepositorySnapshot = {
  source: "cached",
  fullName: "lovableteat/demo-repository",
  description: "GitHub demo repository，包含網站首頁與自動化工作流程。",
  htmlUrl: DEMO_REPOSITORY.url,
  defaultBranch: "main",
  language: "HTML",
  stars: 0,
  forks: 0,
  openIssues: 0,
  updatedAt: "2026-08-20T11:22:54+08:00",
  pushedAt: "2026-08-20T11:22:54+08:00",
  commits: [{
    sha: "8a1fc5f253a976690bbf2087b1536c5696599297",
    shortSha: "8a1fc5f",
    message: "Initial commit",
    authorName: "liu52417",
    authorLogin: "liu52417",
    authoredAt: "2026-08-20T11:22:54+08:00",
    url: `${DEMO_REPOSITORY.url}/commit/8a1fc5f253a976690bbf2087b1536c5696599297`,
  }],
  workflows: [
    { id: 1, name: "Auto Assign", path: ".github/workflows/auto-assign.yml", state: "active", url: `${DEMO_REPOSITORY.url}/actions` },
    { id: 2, name: "Proof HTML", path: ".github/workflows/proof-html.yml", state: "active", url: `${DEMO_REPOSITORY.url}/actions` },
  ],
};

type GithubFetch = (input: string, init?: RequestInit) => Promise<Response>;

async function readGithubJson<T>(fetchImpl: GithubFetch, url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetchImpl(url, {
    headers: { Accept: "application/vnd.github+json" },
    signal,
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${response.status}`);
  }
  return response.json() as Promise<T>;
}

interface GithubRepositoryResponse {
  full_name?: unknown;
  description?: unknown;
  html_url?: unknown;
  default_branch?: unknown;
  language?: unknown;
  stargazers_count?: unknown;
  forks_count?: unknown;
  open_issues_count?: unknown;
  updated_at?: unknown;
  pushed_at?: unknown;
}

interface GithubCommitResponse {
  sha?: unknown;
  html_url?: unknown;
  commit?: {
    message?: unknown;
    author?: { name?: unknown; date?: unknown };
  };
  author?: { login?: unknown } | null;
}

interface GithubWorkflowResponse {
  id?: unknown;
  name?: unknown;
  path?: unknown;
  state?: unknown;
  html_url?: unknown;
}

const asString = (value: unknown, fallback = "") => typeof value === "string" ? value : fallback;
const asNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;

export async function fetchDemoRepositorySnapshot({
  signal,
  fetchImpl = fetch,
}: {
  signal?: AbortSignal;
  fetchImpl?: GithubFetch;
} = {}): Promise<GithubRepositorySnapshot> {
  const base = `https://api.github.com/repos/${DEMO_REPOSITORY.owner}/${DEMO_REPOSITORY.name}`;
  const [repository, commits, workflows] = await Promise.all([
    readGithubJson<GithubRepositoryResponse>(fetchImpl, base, signal),
    readGithubJson<GithubCommitResponse[]>(fetchImpl, `${base}/commits?per_page=6`, signal),
    readGithubJson<{ workflows?: GithubWorkflowResponse[] }>(fetchImpl, `${base}/actions/workflows?per_page=10`, signal),
  ]);

  return {
    source: "live",
    fullName: asString(repository.full_name, `${DEMO_REPOSITORY.owner}/${DEMO_REPOSITORY.name}`),
    description: asString(repository.description, "GitHub 專案活動資料"),
    htmlUrl: asString(repository.html_url, DEMO_REPOSITORY.url),
    defaultBranch: asString(repository.default_branch, "main"),
    language: repository.language == null ? null : asString(repository.language),
    stars: asNumber(repository.stargazers_count),
    forks: asNumber(repository.forks_count),
    openIssues: asNumber(repository.open_issues_count),
    updatedAt: asString(repository.updated_at),
    pushedAt: repository.pushed_at == null ? null : asString(repository.pushed_at),
    commits: (Array.isArray(commits) ? commits : []).flatMap((commit) => {
      const sha = asString(commit.sha);
      if (!sha) return [];
      return [{
        sha,
        shortSha: sha.slice(0, 7),
        message: asString(commit.commit?.message).split("\n")[0] || "未命名提交",
        authorName: asString(commit.commit?.author?.name, "未知作者"),
        authorLogin: asString(commit.author?.login),
        authoredAt: asString(commit.commit?.author?.date),
        url: asString(commit.html_url, `${DEMO_REPOSITORY.url}/commit/${sha}`),
      }];
    }),
    workflows: (Array.isArray(workflows.workflows) ? workflows.workflows : []).flatMap((workflow) => {
      const id = asNumber(workflow.id);
      return id ? [{
        id,
        name: asString(workflow.name, "未命名流程"),
        path: asString(workflow.path),
        state: asString(workflow.state, "active"),
        url: asString(workflow.html_url, `${DEMO_REPOSITORY.url}/actions`),
      }] : [];
    }),
  };
}

export const formatGithubDate = (value: string | null | undefined) => {
  if (!value) return "尚未更新";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "尚未更新";
  return new Intl.DateTimeFormat("zh-TW", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).format(date);
};
