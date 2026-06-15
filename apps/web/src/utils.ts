import type { AgentSummary, PluginSummary } from "./types";

const CURSOR_CLI_INSTALL_COMMAND_WINDOWS =
  "irm 'https://cursor.com/install?win32=true' | iex";
const CURSOR_CLI_INSTALL_COMMAND_UNIX = "curl https://cursor.com/install -fsS | bash";

export function resolveInstallCommand(item: Pick<AgentSummary | PluginSummary, "id" | "install_command">) {
  if (item.install_command) {
    return item.install_command;
  }

  if (item.id !== "cursor") {
    return "";
  }

  const isWindows =
    typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent);

  return isWindows ? CURSOR_CLI_INSTALL_COMMAND_WINDOWS : CURSOR_CLI_INSTALL_COMMAND_UNIX;
}
