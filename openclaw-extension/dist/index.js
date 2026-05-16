import { emptyPluginConfigSchema } from "openclaw/plugin-sdk/plugin-entry";
import { hubPlugin } from "./src/channel.js";
import { setHubRuntime } from "./src/runtime.js";
const plugin = {
    id: "swissclaw-hub",
    name: "Swissclaw Hub",
    description: "Swissclaw Hub chat channel plugin",
    configSchema: emptyPluginConfigSchema(),
    register(api) {
        setHubRuntime(api.runtime);
        api.registerChannel({ plugin: hubPlugin });
    },
};
export default plugin;
