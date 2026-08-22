// ANSI styling helpers for the /team overlay. When a Pi Theme object is
// available (from ctx.ui.custom / ctx.ui.theme / widget factory callbacks) we
// style through theme.fg/theme.bold so colors track the active terminal theme.
// When no theme is supplied we fall back to the legacy 256-color palette so
// standalone callers and tests keep stable output.
const ESC = "\x1b[";
const RESET = `${ESC}0m`;
function wrap(open, text) {
    if (!text)
        return text;
    return `${ESC}${open}m${text}${RESET}`;
}
export const bold = (text) => wrap("1", text);
export const dim = (text) => wrap("2", text);
export const muted = (text) => wrap("38;5;244", text);
export const accent = (text) => wrap("38;5;75", text);
export const accentBold = (text) => wrap("1;38;5;75", text);
export const success = (text) => wrap("38;5;114", text);
export const successBold = (text) => wrap("1;38;5;114", text);
export const warning = (text) => wrap("38;5;179", text);
export const warningBold = (text) => wrap("1;38;5;179", text);
export const danger = (text) => wrap("38;5;167", text);
export const dangerBold = (text) => wrap("1;38;5;167", text);
export const inverse = (text) => wrap("7", text);
const legacy = { bold, dim, muted, accent, accentBold, success, successBold, warning, warningBold, danger, dangerBold, inverse };
export const fallbackPalette = legacy;
export function themedPalette(theme) {
    if (!theme || typeof theme.fg !== "function" || typeof theme.bold !== "function")
        return legacy;
    return {
        bold: (text) => (text ? theme.bold(text) : text),
        dim: (text) => (text ? theme.fg("dim", text) : text),
        muted: (text) => (text ? theme.fg("muted", text) : text),
        accent: (text) => (text ? theme.fg("accent", text) : text),
        accentBold: (text) => (text ? theme.bold(theme.fg("accent", text)) : text),
        success: (text) => (text ? theme.fg("success", text) : text),
        successBold: (text) => (text ? theme.bold(theme.fg("success", text)) : text),
        warning: (text) => (text ? theme.fg("warning", text) : text),
        warningBold: (text) => (text ? theme.bold(theme.fg("warning", text)) : text),
        danger: (text) => (text ? theme.fg("error", text) : text),
        dangerBold: (text) => (text ? theme.bold(theme.fg("error", text)) : text),
        inverse: (text) => (text ? theme.inverse(text) : text),
    };
}
// Box-drawing characters (each 1 cell wide). Use these instead of full borders
// where possible to keep width math simple.
export const FRAME = {
    topLeft: "╭",
    topRight: "╮",
    bottomLeft: "╰",
    bottomRight: "╯",
    horizontal: "─",
    vertical: "│",
    teeRight: "├",
    teeLeft: "┤",
};
// Strip our own ANSI styling from a string. Used by mocks/tests that compare
// against plain content.
export function stripAnsi(text) {
    return text.replace(/\x1b\[[0-9;]*m/g, "");
}
// Worker-controlled text must be inert before it reaches terminal render/copy
// surfaces. Keep this separate from trusted theme styling: apply it to raw
// worker payloads first, then wrap the result with Pi-owned colors.
export function sanitizeTerminalText(text) {
    return text
        .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)|\x9d[\s\S]*?(?:\x07|\x9c)/g, "")
        .replace(/\x1b[P^_][\s\S]*?(?:\x1b\\|\x9c)/g, "")
        .replace(/\x1b\[[0-?]*[ -/]*[@-~]|\x9b[0-?]*[ -/]*[@-~]/g, "")
        .replace(/\x1b[\(\)#%*+\-.\/0-?]*[ -/]*[@-~]?/g, "")
        .replace(/\t/g, "    ")
        .replace(/[\x00-\x08\x0b\x0c\x0d\x0e-\x1f\x7f-\x9f]/g, "");
}
