import { createPluginRuntimeStore } from "openclaw/plugin-sdk/runtime-store";
const { setRuntime: setHubRuntime, getRuntime: getHubRuntime } = createPluginRuntimeStore("Swissclaw Hub runtime not initialized");
export { getHubRuntime, setHubRuntime };
