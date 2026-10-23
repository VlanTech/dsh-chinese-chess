import { homedir } from "node:os";
import path from "node:path";

/** Resolve a package inside the local DSH install, without a hardcoded home path. */
export function dshModule(...parts) {
  const root = process.env.DSH_PACKAGE_ROOT
    || path.join(homedir(), ".local", "lib", "node_modules", "@deepseek-ai", "dsh");
  return path.join(root, "node_modules", ...parts);
}
