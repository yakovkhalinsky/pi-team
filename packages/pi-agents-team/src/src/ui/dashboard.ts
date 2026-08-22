import { truncateToWidth } from "@earendil-works/pi-tui";
import { compareWorkerIds } from "../types.js";
import { formatMemoryStatusFragment, getMemoryStatusGlyph } from "../memory/memory-status.js";
import { WORKER_ATTENTION_ORDER, formatWorkerLabel, formatWorkerStatusLabel, getWorkerAttentionDisplay, getWorkerAttentionPriority as getSharedWorkerAttentionPriority, getWorkerPrimaryAction, } from "./display-grammar.js";
import { themedPalette } from "./theme.js";
import { formatCompactTokenCount } from "./usage-format.js";
const DEFAULT_DASHBOARD_WIDTH = 160;
function sortWorkers(workers) {
    return workers.slice().sort((left, right) => compareWorkerIds(left.workerId, right.workerId));
}
export function getWorkerAttentionGroup(worker) {
    return getSharedWorkerAttentionPriority(worker);
}
export function buildWorkerPrioritySnippet(worker) {
    const relay = worker.pendingRelayQuestions[0]?.question?.trim();
    if (relay)
        return `reply: ${relay}`;
    if (worker.error?.trim())
        return `recovery: ${worker.error.trim()}`;
    if (worker.lastSummary?.headline?.trim())
        return `headline: ${worker.lastSummary.headline.trim()}`;
    if (worker.currentTask?.title?.trim())
        return `task: ${worker.currentTask.title.trim()}`;
    return `status: ${worker.status}`;
}
export function buildRosterSections(state) {
    const grouped = {
        needs_reply: [],
        needs_recovery: [],
        in_progress: [],
        completed_or_idle: [],
    };
    for (const worker of Object.values(state.activeWorkers)) {
        grouped[getWorkerAttentionGroup(worker)].push(worker);
    }
    return WORKER_ATTENTION_ORDER.map((key) => ({
        key,
        label: getWorkerAttentionDisplay(key).label,
        workers: sortWorkers(grouped[key]),
    }));
}
export function buildActionSummaryLine(state, theme) {
    const palette = theme ? themedPalette(theme) : undefined;
    const sections = buildRosterSections(state);
    return sections
        .map((section) => (palette ? `${palette.accent(section.label)} ${palette.bold(String(section.workers.length))}` : `${section.label} ${section.workers.length}`))
        .join(" · ");
}
export function buildCompactTeamSummaryLine(state, theme) {
    const palette = theme ? themedPalette(theme) : undefined;
    const workerCount = Object.keys(state.activeWorkers).length;
    const mode = palette ? palette.accent(String(state.sessionMode)) : state.sessionMode;
    const relays = palette ? palette.warning(String(state.relayQueue.length)) : state.relayQueue.length;
    const memory = formatMemoryStatusFragment(state.edenMemoryStatus);
    const base = `workers ${workerCount} · mode ${mode} · relays ${relays} · ${buildActionSummaryLine(state, theme)}`;
    return memory ? `${base} · ${memory}` : base;
}
export function buildTeamDashboardLines(state, themeOrOptions, width = DEFAULT_DASHBOARD_WIDTH) {
    const options = themeOrOptions && ("displayCost" in themeOrOptions || "theme" in themeOrOptions || "width" in themeOrOptions)
        ? themeOrOptions
        : { theme: themeOrOptions, width };
    const theme = options.theme;
    const resolvedWidth = options.width ?? width;
    const displayCost = options.displayCost !== false;
    const palette = theme ? themedPalette(theme) : undefined;
    const workers = Object.values(state.activeWorkers);
    const tabSummary = displayCost ? "Workers / Inspect / Console / Cost" : "Workers / Inspect / Console";
    const lines = [
        truncateToWidth(palette ? palette.accentBold("Pi Agents Team Dashboard") : "Pi Agents Team Dashboard", resolvedWidth),
        truncateToWidth(buildCompactTeamSummaryLine(state, theme), resolvedWidth),
    ];
    const memoryStatus = state.edenMemoryStatus;
    if (memoryStatus?.enabled) {
        const memoryGlyph = getMemoryStatusGlyph(memoryStatus);
        const memoryLine = palette
            ? `${palette.dim("Memory")} ${memoryGlyph} ${palette.dim(`written=${memoryStatus.recordsWritten} failed=${memoryStatus.recordsFailed}${memoryStatus.lastError ? ` lastErr=${memoryStatus.lastError.slice(0, 40)}` : ""}`)}`
            : `Memory ${memoryGlyph} written=${memoryStatus.recordsWritten} failed=${memoryStatus.recordsFailed}${memoryStatus.lastError ? ` lastErr=${memoryStatus.lastError.slice(0, 40)}` : ""}`;
        lines.push(truncateToWidth(memoryLine, resolvedWidth, "…"));
    }
    lines.push(
        truncateToWidth("/team opens a keyboard-first overlay with the complete worker registry grouped by attention.", resolvedWidth),
        truncateToWidth(`Use /team <worker-id> for direct focus, then inspect ${tabSummary} tabs. Print mode stays summary-only.`, resolvedWidth),
        truncateToWidth("Use /team-result <id> for the final deliverable block.", resolvedWidth),
        "",
    );
    if (workers.length === 0) {
        lines.push(truncateToWidth(palette ? palette.dim("No tracked workers.") : "No tracked workers.", resolvedWidth));
        return lines;
    }
    for (const section of buildRosterSections(state)) {
        if (section.workers.length === 0)
            continue;
        const sectionHeader = palette
            ? `${palette.accentBold(section.label)} (${palette.bold(String(section.workers.length))})`
            : `${section.label} (${section.workers.length})`;
        lines.push(truncateToWidth(sectionHeader, resolvedWidth));
        for (const worker of section.workers) {
            lines.push(truncateToWidth(`- ${formatWorkerLabel(worker)} — ${buildWorkerPrioritySnippet(worker)}`, resolvedWidth, "…"));
            lines.push(truncateToWidth(`  status: ${worker.status} (${formatWorkerStatusLabel(worker)}) · action: ${getWorkerPrimaryAction(worker)}`, resolvedWidth, "…"));
            if (worker.worktreePath)
                lines.push(truncateToWidth(`  worktree: ${worker.worktreePath}`, resolvedWidth, "…"));
            if (worker.currentTask?.title)
                lines.push(truncateToWidth(`  task: ${worker.currentTask.title}`, resolvedWidth, "…"));
            lines.push(truncateToWidth(`  usage: turns=${worker.usage.turns} input=${formatCompactTokenCount(worker.usage.inputTokens)} output=${formatCompactTokenCount(worker.usage.outputTokens)}`, resolvedWidth, "…"));
        }
        lines.push("");
    }
    return lines;
}
export function buildNarrowInspectText(worker, width = 79) {
    const lines = [];
    const statusLabel = formatWorkerStatusLabel(worker);
    lines.push(truncateToWidth(`${worker.workerId} · ${worker.profileName} · ${worker.status} (${statusLabel})`, width, "…"));
    if (worker.pendingRelayQuestions.length > 0) {
        const relay = worker.pendingRelayQuestions[0];
        lines.push(truncateToWidth(`needs reply: ${relay.question}`, width, "…"));
        if (relay.assumption)
            lines.push(truncateToWidth(`assumption: ${relay.assumption}`, width, "…"));
    }
    if (worker.error)
        lines.push(truncateToWidth(`error: ${worker.error}`, width, "…"));
    if (worker.currentTask?.title)
        lines.push(truncateToWidth(`task: ${worker.currentTask.title}`, width, "…"));
    if (worker.worktreePath)
        lines.push(truncateToWidth(`worktree: ${worker.worktreePath}`, width, "…"));
    if (worker.lastSummary?.headline)
        lines.push(truncateToWidth(`summary: ${worker.lastSummary.headline}`, width, "…"));
    lines.push(truncateToWidth(`usage: turns=${worker.usage.turns} in=${formatCompactTokenCount(worker.usage.inputTokens)} out=${formatCompactTokenCount(worker.usage.outputTokens)}`, width, "…"));
    if (worker.finalAnswer)
        lines.push(truncateToWidth(`final: ${worker.finalAnswer.trim()}`, width, "…"));
    return lines.join("\n");
}
export function buildNarrowTeamDashboardText(state, width = 79) {
    const workers = Object.values(state.activeWorkers);
    const lines = [
        truncateToWidth(`Pi Agents Team · workers=${workers.length} · relays=${state.relayQueue.length}`, width, "…"),
        truncateToWidth("Use /team <id> for one worker. Use /team-steer <id> <msg> to guide.", width, "…"),
    ];
    if (workers.length === 0) {
        lines.push("No tracked workers.");
        return lines.join("\n");
    }
    for (const section of buildRosterSections(state)) {
        if (section.workers.length === 0)
            continue;
        lines.push(truncateToWidth(`${section.label} (${section.workers.length}):`, width, "…"));
        for (const worker of section.workers) {
            lines.push(truncateToWidth(`- ${formatWorkerLabel(worker)} · ${buildWorkerPrioritySnippet(worker)}`, width, "…"));
        }
    }
    return lines.join("\n");
}
export function buildTeamDashboardText(state, themeOrOptions, width = DEFAULT_DASHBOARD_WIDTH) {
    return buildTeamDashboardLines(state, themeOrOptions, width).join("\n");
}
