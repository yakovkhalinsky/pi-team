import { Text } from "@earendil-works/pi-tui";
import { type AgentToolName } from "./display-grammar.js";
type MutableText = Text & {
    setText(text: string): void;
};
type ToolRenderTheme = {
    bold(text: string): string;
    fg(color: string, text: string): string;
};
type ToolRenderContext = {
    lastComponent?: unknown;
};
export declare function renderAgentToolCallTitle(toolName: AgentToolName): (args: unknown, theme: ToolRenderTheme, context?: ToolRenderContext) => MutableText;
export {};
