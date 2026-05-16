import type { ChannelPlugin } from "openclaw/plugin-sdk/channel-core";
import { type OpenClawPluginApi, emptyPluginConfigSchema } from "openclaw/plugin-sdk/plugin-entry";
import { hubPlugin } from "./src/channel.js";
import { setHubRuntime } from "./src/runtime.js";

const plugin = {
  id: "swissclaw-hub",
  name: "Swissclaw Hub",
  description: "Swissclaw Hub chat channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setHubRuntime(api.runtime);
    api.registerChannel({ plugin: hubPlugin as ChannelPlugin });
  },
};

export default plugin;
