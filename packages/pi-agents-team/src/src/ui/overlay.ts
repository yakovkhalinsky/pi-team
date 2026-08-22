import { SelectList, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { buildRosterSections, buildWorkerPrioritySnippet } from "./dashboard.js";
import { extractFinalAnswer, parseFinalAnswerSummaryFields } from "../runtime/final-answer.js";
import { formatCacheUsage, formatCompactTokenCount, formatContextBudget } from "./usage-format.js";
import { formatProfileLabel, formatWorkerStatusLabel, getWorkerAttentionDisplay, getWorkerAttentionPriority, getWorkerPrimaryAction } from "./display-grammar.js";
import { FRAME, stripAnsi, sanitizeTerminalText, themedPalette, fallbackPalette } from "./theme.js";

// The overlay is a single-instance custom component. Styling helpers delegate
// to a mutable palette so the Pi Theme object supplied by ctx.ui.custom can be
// applied, invalidated, and rebuilt without threading a palette through every
// standalone helper signature.
let currentPalette = fallbackPalette;
const fallbackTheme = {
    fg(role, text) {
        if (!text)
            return text;
        if (role === "accent")
            return fallbackPalette.accent(text);
        if (role === "success")
            return fallbackPalette.success(text);
        if (role === "warning")
            return fallbackPalette.warning(text);
        if (role === "error")
            return fallbackPalette.danger(text);
        if (role === "dim" || role === "muted" || role === "border")
            return fallbackPalette.muted(text);
        return text;
    },
    bold: fallbackPalette.bold,
    inverse: fallbackPalette.inverse,
};
function isUsableTheme(theme) {
    return !!theme
        && typeof theme.fg === "function"
        && typeof theme.bold === "function"
        && typeof theme.inverse === "function";
}
function resolveTheme(theme) {
    return isUsableTheme(theme) ? theme : fallbackTheme;
}
const bold = (text) => currentPalette.bold(text);
const dim = (text) => currentPalette.dim(text);
const muted = (text) => currentPalette.muted(text);
const accent = (text) => currentPalette.accent(text);
const accentBold = (text) => currentPalette.accentBold(text);
const success = (text) => currentPalette.success(text);
const successBold = (text) => currentPalette.successBold(text);
const warning = (text) => currentPalette.warning(text);
const warningBold = (text) => currentPalette.warningBold(text);
const danger = (text) => currentPalette.danger(text);
const dangerBold = (text) => currentPalette.dangerBold(text);
const inverse = (text) => currentPalette.inverse(text);
export function setPalette(theme) {
    // The factory may hand us an empty object in tests; only switch to a real
    // Pi Theme when the expected callbacks are present so styling never breaks.
    if (isUsableTheme(theme)) {
        currentPalette = themedPalette(theme);
    }
    else {
        currentPalette = fallbackPalette;
    }
}
const TAB_ORDER = ["workers", "inspect", "console", "cost"];
const TAB_LABELS = {
    workers: "Workers",
    inspect: "Inspect",
    console: "Console",
    cost: "Cost",
};
const REUSABLE_STATUSES = new Set(["idle", "waiting_followup"]);

function colorForGroupBold(group) {
    switch (group) {
        case "needs_reply":
            return warningBold;
        case "needs_recovery":
            return dangerBold;
        case "in_progress":
            return accentBold;
        case "completed_or_idle":
            return successBold;
    }
}

function colorForWorker(worker) {
    if (worker.pendingRelayQuestions.length > 0)
        return warning;
    switch (worker.status) {
        case "running":
        case "starting":
            return accent;
        case "waiting_followup":
            return warning;
        case "idle":
            return worker.finalAnswer ? success : muted;
        case "completed":
            return success;
        case "aborted":
        case "error":
        case "exited":
            return danger;
        default:
            return muted;
    }
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}
function firstFitting(width, candidates) {
    for (const candidate of candidates) {
        if (visibleWidth(candidate) <= width) {
            return candidate;
        }
    }
    return candidates.length > 0 ? truncateToWidth(candidates[candidates.length - 1], width, "…") : "";
}







export function buildInspectText(worker, transcript, consoleEvents, activityEvents, palette) {
    const lines = [];
    const reusable = REUSABLE_STATUSES.has(worker.status) ? "  [reusable]" : "";
    const statusBody = [
        `${worker.workerId} · ${worker.profileName} · ${formatInspectStatus(worker, palette)}${reusable}`,
        `${palette.dim("Usage:")} ${formatUsage(worker)}`,
        `${palette.dim("Thinking:")} ${formatThinking(worker, palette)}`,
    ];
    if (worker.lastToolName)
        statusBody.push(`${palette.dim("Last tool:")} ${sanitizeTerminalText(worker.lastToolName)}`);
    if (worker.error)
        statusBody.push(`${palette.dim("Error:")} ${palette.danger(sanitizeTerminalText(worker.error))}`);
    pushInspectBlock(lines, "Status", statusBody, palette, formatInspectStatus(worker, palette));
    const recentActivity = buildRecentActivityRows(worker, transcript, consoleEvents, activityEvents);
    if (recentActivity.length > 0)
        pushInspectBlock(lines, "Recent activity", recentActivity, palette);
    const taskBody = [];
    if (worker.currentTask) {
        taskBody.push(worker.currentTask.title);
        if (worker.currentTask.goal)
            taskBody.push(`${palette.dim("Goal:")} ${worker.currentTask.goal}`);
        if (worker.currentTask.expectedOutput)
            taskBody.push(`${palette.dim("Expected:")} ${worker.currentTask.expectedOutput}`);
        pushInspectList(taskBody, "Context:", worker.currentTask.contextHints, palette);
        if (worker.currentTask.pathScope)
            pushInspectList(taskBody, "Path scope:", worker.currentTask.pathScope.roots, palette);
    }
    else {
        taskBody.push("(none)");
    }
    pushInspectBlock(lines, "Task", taskBody, palette);
    const operatorBody = [];
    if (worker.pendingRelayQuestions.length === 0) {
        operatorBody.push("(none)");
    }
    else {
        for (const relay of worker.pendingRelayQuestions) {
            operatorBody.push(`${warningBold(`[${relay.urgency}]`)} ${sanitizeTerminalText(relay.question)}`);
            operatorBody.push(`${palette.dim("Assumption:")} ${sanitizeTerminalText(relay.assumption)}`);
        }
    }
    pushInspectBlock(lines, "Needs operator", operatorBody, palette, worker.pendingRelayQuestions.length > 0 ? "attention" : undefined);
    const summaryBody = [];
    if (worker.lastSummary) {
        summaryBody.push(`${palette.dim("Headline:")} ${sanitizeTerminalText(worker.lastSummary.headline)}`);
        pushInspectList(summaryBody, "Read files:", worker.lastSummary.readFiles.map(sanitizeTerminalText), palette);
        pushInspectList(summaryBody, "Changed files:", worker.lastSummary.changedFiles.map(sanitizeTerminalText), palette);
        pushInspectList(summaryBody, "Risks:", worker.lastSummary.risks.map(sanitizeTerminalText), palette);
        if (worker.lastSummary.nextRecommendation)
            summaryBody.push(`${palette.dim("Next:")} ${sanitizeTerminalText(worker.lastSummary.nextRecommendation)}`);
    }
    else {
        summaryBody.push("(no summary captured yet)");
    }
    pushInspectBlock(lines, "Summary", summaryBody, palette);
    const finalAnswer = sanitizeTerminalText(worker.finalAnswer ?? "").trim();
    const assistantText = formatRetainedTranscript(transcript);
    pushInspectBlock(lines, "Final answer", (finalAnswer || "(no <final_answer> block produced)").split("\n"), palette, worker.finalAnswer ? "ok" : undefined, { structured: true });
    pushInspectBlock(lines, "Latest assistant text", (assistantText || "(no assistant text captured)").split("\n"), palette, assistantText ? "tail" : undefined, { structured: true });
    return lines.join("\n");
}





export function buildConsoleLines(worker, chunks, consoleEvents, activityEvents, mode = "activity") {
    if (mode === "raw")
        return buildRawConsoleLines(worker, chunks, consoleEvents);
    const activity = (activityEvents && activityEvents.length > 0 ? activityEvents : synthesizeActivity(chunks, consoleEvents));
    if (activity.length === 0) {
        return [`${worker.workerId} · ${worker.profileName} · ${worker.status}`, "", accentBold("— activity —"), dim("(no activity yet — press r for raw logs)")];
    }
    const lines = [`${worker.workerId} · ${worker.profileName} · ${worker.status}  ·  chunks=${chunks.length}  events=${consoleEvents.length}  activity=${activity.length}  ·  raw:r`, "", accentBold("— activity —")];
    activity.forEach((event, index) => {
        if (index > 0)
            lines.push("");
        lines.push(...formatActivityEvent(event));
    });
    return lines;
}

export function buildCostLines(state) {
    const workers = Object.values(state.activeWorkers);
    const total = aggregateWorkerUsage(workers, state.prunedWorkerUsageTotals);
    const retained = state.prunedWorkerUsageTotals;
    if (workers.length === 0 && !hasWorkerUsage(retained))
        return ["(no tracked workers)"];
    const rows = [];
    if (hasWorkerUsage(retained)) {
        rows.push(`retained/pruned: workers=${retained.workers}  turns=${retained.turns}  in=${formatCompactTokenCount(retained.inputTokens)}  out=${formatCompactTokenCount(retained.outputTokens)}${formatCachePart(retained)}  cost=$${retained.costUsd.toFixed(4)}`);
    }
    for (const worker of workers) {
        rows.push(`  ${worker.workerId.padEnd(6)} ${worker.profileName.padEnd(12)} turns=${worker.usage.turns}  in=${formatCompactTokenCount(worker.usage.inputTokens)}  out=${formatCompactTokenCount(worker.usage.outputTokens)}${formatCachePart(worker.usage)}  cost=$${worker.usage.costUsd.toFixed(4)}`);
    }
    return [
        `Σ workers=${total.workers}  turns=${total.turns}  in=${formatCompactTokenCount(total.inputTokens)}  out=${formatCompactTokenCount(total.outputTokens)}${formatCachePart(total)}  cost=$${total.costUsd.toFixed(4)}`,
        "",
        ...(rows.length > 0 ? rows : ["(no tracked workers)"]),
    ];
}
function getAttentionOrderedWorkerIds(state) {
    return buildRosterSections(state).flatMap((section) => section.workers.map((worker) => worker.workerId));
}
// Worker output frequently contains tabs and other control bytes whose
// visibleWidth (1) does not match the terminal's rendered width. Normalize
// before any measurement. ESC (0x1b) is preserved so our own ANSI styling
// (theme.ts) and pi-tui's ANSI-aware truncate keep working.
function sanitizeText(text) {
    return text
        .replace(/\t/g, "    ")
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1a\x1c-\x1f\x7f]/g, "");
}
// Strip our own styling before classifying so worker text wrapped in ANSI
// (e.g. a colored `# heading` from a tool) still matches the structural regexes.
function classifyTextLine(line) {
    const plain = stripAnsi(line);
    if (/^\s{4,}\S/.test(plain))
        return { kind: "code", continuation: plain.match(/^\s*/)?.[0] ?? "" };
    if (/^\s{2,}\S/.test(plain))
        return { kind: "plain", continuation: plain.match(/^\s*/)?.[0] ?? "" };
    if (/^\s*(?:at\s+\S|Caused by:|\.{3}\s+\d+\s+more|[A-Za-z_.$][\w.$<>]*Error:)/.test(plain))
        return { kind: "stack", continuation: "    " };
    if (/^\s*#{1,6}\s+\S/.test(plain))
        return { kind: "heading", continuation: dim("↳ ") };
    if (/^\s*(?:[-*+]\s+|\d+[.)]\s+)/.test(plain)) {
        const marker = plain.match(/^(\s*)(?:[-*+]\s+|\d+[.)]\s+)/)?.[0] ?? "";
        return { kind: "list", continuation: " ".repeat(visibleWidth(marker)) };
    }
    if (/^\s*\|.*\|\s*$/.test(plain))
        return { kind: "table", continuation: dim("↳ ") };
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(plain) || /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(plain)) {
        return { kind: "separator", continuation: dim("↳ ") };
    }
    return { kind: "plain", continuation: dim("↳ ") };
}
function formatStructuredLine(line, kind) {
    switch (kind) {
        case "heading":
            return accentBold(line);
        case "separator":
            return dim(line);
        default:
            return line;
    }
}
function wrapTextLine(raw, width) {
    const shape = classifyTextLine(raw);
    const first = formatStructuredLine(raw, shape.kind);
    if (visibleWidth(first) <= width)
        return [first];
    const out = [];
    let remaining = raw;
    let prefix = "";
    let guard = 0;
    while (visibleWidth(prefix + remaining) > width && guard < 1000) {
        const available = Math.max(1, width - visibleWidth(prefix));
        let head = truncateToWidth(remaining, available, "");
        if (shape.kind !== "code" && visibleWidth(head) === available) {
            const breakAt = head.search(/\s+\S*$/);
            if (breakAt > Math.floor(available * 0.45))
                head = head.slice(0, breakAt);
        }
        // truncateToWidth can return "" when the next visible glyph is wider than
        // `available` (e.g. wide CJK char at width=1, or an ANSI escape boundary).
        // Force-consume one code unit so the loop always makes progress instead of
        // breaking and leaving an oversized `remaining` for enforceWidth to ellipsize.
        if (head.length === 0)
            head = remaining.slice(0, 1);
        out.push(prefix + (out.length === 0 ? formatStructuredLine(head, shape.kind) : head));
        const rest = remaining.slice(head.length);
        // Code-like lines keep their internal indentation across wrap chunks so
        // hand-aligned ASCII (stack frames, indented logs) does not collapse.
        remaining = shape.kind === "code" ? rest : rest.trimStart();
        prefix = visibleWidth(shape.continuation) < width ? shape.continuation : "";
        guard += 1;
    }
    if (remaining.length > 0)
        out.push(prefix + remaining);
    return out;
}
export function wrapLines(text, width) {
    if (width <= 0)
        return [];
    return sanitizeText(text).split("\n").flatMap((raw) => wrapTextLine(raw, width));
}
export function enforceWidth(lines, width) {
    return lines.map((line) => {
        const safe = sanitizeText(line);
        return visibleWidth(safe) > width ? truncateToWidth(safe, width, "…") : safe;
    });
}

export class RosterSelectList {
    snapshot;
    selectedWorkerId;
    constructor(snapshot, selectedWorkerId) {
        this.snapshot = snapshot;
        this.selectedWorkerId = selectedWorkerId;
    }
    invalidate() { }
    render(width, rowBudget = ROSTER_PAGE_SIZE) {
        const items = [];
        for (const section of buildRosterSections(this.snapshot)) {
            if (section.workers.length === 0)
                continue;
            items.push({
                value: `__section__${section.key}`,
                label: colorForGroupBold(section.key)(`${section.label} (${section.workers.length})`),
            });
            for (const worker of section.workers) {
                const base = `${worker.workerId} · ${formatProfileLabel(worker.profileName)} · ${worker.status}${REUSABLE_STATUSES.has(worker.status) ? " [reuse]" : ""} · ${buildWorkerPrioritySnippet(worker)}`;
                items.push({ value: worker.workerId, label: colorForWorker(worker)(base) });
            }
        }
        if (items.length === 0) {
            return [dim("No tracked workers. Press [n] to delegate one.")];
        }
        const workerIndices = items
            .map((item, index) => (item.value.startsWith("__section__") ? -1 : index))
            .filter((index) => index >= 0);
        const selectedIndex = this.selectedWorkerId
            ? workerIndices.find((index) => items[index].value === this.selectedWorkerId)
            : undefined;
        const safeSelectedIndex = selectedIndex ?? workerIndices[0] ?? 0;
        const theme = {
            selectedText: (text) => bold(text),
            selectedPrefix: (text) => text,
            description: (text) => text,
            scrollInfo: (text) => text,
            noMatch: (text) => text,
        };
        const visibleRows = Math.max(1, Math.min(rowBudget, ROSTER_PAGE_SIZE));
        const itemRows = items.length > visibleRows && visibleRows > 1 ? visibleRows - 1 : visibleRows;
        const list = new SelectList(items, Math.min(items.length, itemRows), theme);
        list.setSelectedIndex(safeSelectedIndex);
        return list.render(width).map((line) => {
            const plain = stripAnsi(line);
            if (plain.startsWith("→ ")) {
                const arrowIndex = line.indexOf("→ ");
                return line.slice(0, arrowIndex) + "▶ " + line.slice(arrowIndex + 2);
            }
            return line;
        });
    }
}



export function buildTabBar(active, routingMode, displayCost = true) {
    const visibleTabs = displayCost ? TAB_ORDER : TAB_ORDER.filter((tab) => tab !== "cost");
    const cells = visibleTabs.map((tab) => {
        const num = TAB_ORDER.indexOf(tab) + 1;
        const label = `${num} ${TAB_LABELS[tab]}`;
        return tab === active ? accentBold(`[${label}]`) : dim(` ${label} `);
    });
    const badge = routingMode === "solo" ? `  · ${warningBold("solo")}` : "";
    return cells.join(" ") + badge;
}

export function buildSelectedWorkerHeader(worker, width) {
    if (!worker)
        return firstFitting(width, ["selected: none · action: delegate new", "selected: none", "none"]);
    const attention = getWorkerAttentionDisplay(getWorkerAttentionPriority(worker)).label;
    const status = formatWorkerStatusLabel(worker);
    const action = getWorkerPrimaryAction(worker);
    return firstFitting(width, [
        `selected: ${worker.workerId} · ${worker.profileName} · ${status} · ${attention} · action: ${action}`,
        `selected: ${worker.workerId} · ${status} · action: ${action}`,
        `${worker.workerId} · ${status} · ${action}`,
        `${worker.workerId} · ${action}`,
    ]);
}
export function formatFollowHeader(following, top, visible, total) {
    const start = total === 0 ? 0 : top + 1;
    const end = Math.min(total, top + visible);
    const status = following ? "[follow]" : "[paused f/G]";
    return `${status}  scroll ${start}-${end} / ${total}`;
}
