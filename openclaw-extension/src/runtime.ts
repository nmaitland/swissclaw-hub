import { createPluginRuntimeStore } from "openclaw/plugin-sdk";
import type { PluginRuntime } from "openclaw/plugin-sdk";

const { setRuntime: setHubRuntime, getRuntime: getHubRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Swissclaw Hub runtime not initialized");
export { getHubRuntime, setHubRuntime };
