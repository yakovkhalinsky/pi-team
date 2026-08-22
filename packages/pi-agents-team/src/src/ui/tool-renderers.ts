import { Text } from "@earendil-works/pi-tui";
import { buildAgentToolCallTitle } from "./display-grammar.js";
function coerceAgentToolTitleArgs(args) {
    if (!args || typeof args !== "object")
        return {};
    const record = args;
    return {
        profileName: typeof record.profileName === "string" ? record.profileName : undefined,
        workerId: typeof record.workerId === "string" ? record.workerId : undefined,
        workerIds: Array.isArray(record.workerIds) ? record.workerIds.filter((item) => typeof item === "string") : undefined,
        reuseWorkerId: typeof record.reuseWorkerId === "string" ? record.reuseWorkerId : undefined,
    };
}
export function renderAgentToolCallTitle(toolName) {
    return (args, theme, context = {}) => {
        const text = (context.lastComponent instanceof Text ? context.lastComponent : new Text("", 0, 0));
        text.setText(theme.fg("toolTitle", theme.bold(buildAgentToolCallTitle(toolName, coerceAgentToolTitleArgs(args)))));
        return text;
    };
}
