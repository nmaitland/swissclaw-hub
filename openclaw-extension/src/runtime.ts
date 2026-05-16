import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";
import type { PluginRuntime } from "openclaw/plugin-sdk/plugin-runtime";

const { setRuntime: setHubRuntime, getRuntime: getHubRuntime } =
  createPluginRuntimeStore<PluginRuntime>("Swissclaw Hub runtime not initialized");
export { getHubRuntime, setHubRuntime };
