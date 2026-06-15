import { useCallback, useEffect, useMemo, useState } from "react";

export type PageId = "overview" | "agents" | "plugins" | "skills" | "settings";

export type AgentDetailTab = "overview" | "account" | "config";

export type AppRoute =
  | { page: "overview" }
  | { page: "agents"; agentId?: string; tab?: AgentDetailTab }
  | { page: "plugins"; pluginId?: string }
  | { page: "skills"; scope: string; folderId?: string; fileId?: string }
  | { page: "settings" }
  | { page: "unknown" };

export const NAV_ITEMS: { id: PageId; label: string; path: string }[] = [
  { id: "overview", label: "概览", path: "/overview" },
  { id: "agents", label: "Agents", path: "/agents" },
  { id: "plugins", label: "Plugins", path: "/plugins" },
  { id: "skills", label: "Skills", path: "/skills/common" },
  { id: "settings", label: "设置", path: "/settings" },
];

export const PAGE_TITLES: Record<PageId, string> = {
  overview: "概览",
  agents: "Agents",
  plugins: "Plugins",
  skills: "Skills",
  settings: "设置",
};

const AGENT_TABS = new Set<AgentDetailTab>(["overview", "account", "config"]);

function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

/** URL 中的 folder 段（不含 agent 前缀），如 `cs-brainstorm`。 */
export function skillFolderSlug(agent: string, id: string): string {
  const prefix = `${agent}/`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

/** URL 中的 file 段（文件夹内相对路径），如 `SKILL.md` 或 `references/foo.md`。 */
export function skillFileSlug(agent: string, folder: string, id: string): string {
  const prefix = `${agent}/${folder}/`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
}

/** 将 URL folder 段还原为 API 所需的 `agent/文件夹名`。 */
export function buildSkillApiFolderId(scope: string, folderSlug: string): string {
  const decoded = decodePathSegment(folderSlug);
  const scopePrefix = `${scope}/`;
  if (decoded.startsWith(scopePrefix) || decoded.includes("/")) {
    return decoded;
  }
  return `${scope}/${decoded}`;
}

/** 将 URL file 段还原为 API 所需的完整 skill 文件 id。 */
export function buildSkillApiFileId(
  scope: string,
  folderSlug: string | undefined,
  fileSlug: string,
): string {
  const decodedFile = decodePathSegment(fileSlug);
  const scopePrefix = `${scope}/`;
  if (decodedFile.startsWith(scopePrefix)) {
    return decodedFile;
  }
  if (!folderSlug) {
    return decodedFile;
  }
  return `${buildSkillApiFolderId(scope, folderSlug)}/${decodedFile}`;
}

export function parseRoute(pathname: string): AppRoute {
  const normalized = pathname.replace(/\/+$/, "") || "/";
  const segments = normalized.split("/").filter(Boolean);

  if (segments.length === 0) {
    return { page: "overview" };
  }

  switch (segments[0]) {
    case "overview":
      return segments.length === 1 ? { page: "overview" } : { page: "unknown" };
    case "agents": {
      if (segments.length === 1) {
        return { page: "agents" };
      }

      const agentId = segments[1];
      const tab = (segments[2] ?? "overview") as AgentDetailTab;

      if (!AGENT_TABS.has(tab) || segments.length > 3) {
        return { page: "unknown" };
      }

      return { page: "agents", agentId, tab };
    }
    case "plugins": {
      if (segments.length === 1) {
        return { page: "plugins" };
      }

      if (segments.length === 2) {
        return { page: "plugins", pluginId: segments[1] };
      }

      return { page: "unknown" };
    }
    case "skills": {
      if (segments.length === 1) {
        return { page: "skills", scope: "common" };
      }

      const scope = decodePathSegment(segments[1]);
      const folderId = segments[2] ? decodePathSegment(segments[2]) : undefined;
      const fileId = segments[3] ? decodePathSegment(segments[3]) : undefined;

      if (segments.length > 4) {
        return { page: "unknown" };
      }

      return { page: "skills", scope, folderId, fileId };
    }
    case "settings":
      return segments.length === 1 ? { page: "settings" } : { page: "unknown" };
    default:
      return { page: "unknown" };
  }
}

export function buildAgentPath(agentId: string, tab: AgentDetailTab = "overview") {
  return tab === "overview" ? `/agents/${encodeURIComponent(agentId)}` : `/agents/${encodeURIComponent(agentId)}/${tab}`;
}

export function buildPluginPath(pluginId: string) {
  return `/plugins/${encodeURIComponent(pluginId)}`;
}

export function buildSkillsPath(scope: string, folderId?: string, fileId?: string) {
  const base = `/skills/${encodeURIComponent(scope)}`;

  if (!folderId) {
    return base;
  }

  if (!fileId) {
    return `${base}/${encodeURIComponent(folderId)}`;
  }

  return `${base}/${encodeURIComponent(folderId)}/${encodeURIComponent(fileId)}`;
}

export function routePage(route: AppRoute): PageId | null {
  if (route.page === "unknown") {
    return null;
  }

  return route.page;
}

export function defaultAuthenticatedPath() {
  return "/overview";
}

function normalizeInitialPathname(pathname: string) {
  if (pathname === "/" || pathname === "") {
    const normalized = defaultAuthenticatedPath();
    window.history.replaceState(null, "", normalized);
    return normalized;
  }

  return pathname;
}

export function useRouter() {
  const [location, setLocation] = useState(() => ({
    pathname: normalizeInitialPathname(window.location.pathname),
    refreshKey: 0,
  }));

  useEffect(() => {
    const onPopState = () => {
      setLocation((current) => ({
        pathname: window.location.pathname,
        refreshKey: current.refreshKey,
      }));
    };

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const navigate = useCallback((path: string) => {
    if (window.location.pathname !== path) {
      window.history.pushState(null, "", path);
    }

    setLocation((current) => ({
      pathname: path,
      refreshKey: current.refreshKey,
    }));
  }, []);

  const refresh = useCallback(() => {
    setLocation((current) => ({
      ...current,
      refreshKey: current.refreshKey + 1,
    }));
  }, []);

  const route = useMemo(() => parseRoute(location.pathname), [location.pathname]);

  return {
    route,
    pathname: location.pathname,
    refreshKey: location.refreshKey,
    navigate,
    refresh,
  };
}
