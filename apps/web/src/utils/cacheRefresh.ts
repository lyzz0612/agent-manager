import type { AppRoute } from "../routing";

export type CacheRefreshRequest = {
  scope: string;
  plugin_id?: string;
};

export function cacheRefreshPayload(route: AppRoute): CacheRefreshRequest | null {
  switch (route.page) {
    case "overview":
      return { scope: "overview" };
    case "agents":
      if (route.agentId && route.tab === "account") {
        return { scope: "cursor_account" };
      }
      return { scope: "agents" };
    case "plugins":
      if (route.pluginId === "gh") {
        return { scope: "gh_account" };
      }
      if (route.pluginId) {
        return { scope: "plugin", plugin_id: route.pluginId };
      }
      return { scope: "plugins" };
    case "skills":
    case "settings":
      return null;
    default:
      return null;
  }
}
