import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { compareWorkerIds } from "../types.js";
import { aggregateWorkerUsage, hasWorkerUsage } from "../usage.js";
import { formatProfileLabel, formatWorkerDisplayId, formatWorkerStatusLabel, getWorkerAttentionDisplay, getWorkerAttentionPriority, getWorkerStatusGlyph } from "./display-grammar.js";
import { bold as legacyBold, themedPalette } from "./theme.js";
import { formatCacheUsage, formatCacheUsageWithHit, formatCompactTokenCount } from "./usage-format.js";
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export const TEAM_STATUS_TIPS = [
    "Use /team to view workers",
    "Use /team-result <id> for final output",
    "Use /team-copy <id> to copy a worker result",
    "Use /team-init [local] to rewrite default team",
    "Use /team-steer <id> <message> to guide a worker",
    "Use /team-stop <id> to cancel or close a worker",
    "Use /team <id> to view one worker details",
    "Use /team-enable [on/off] to manage orchestrator"
];
const NON_TERMINAL_STATUSES = new Set(["starting", "running", "waiting_followup"]);
const ACTIVE_ROW_STATUSES = new Set(["starting", "running", "waiting_followup"]);
const TERMINAL_STATUSES = new Set(["idle", "completed", "aborted", "error", "exited"]);
const RECENT_TERMINAL_RETENTION_MS = 5 * 60 * 1000;
const MAX_WIDGET_WORKERS = 8;
const MAX_WIDGET_WORKERS_COMPACT = 5;
const MAX_WIDGET_WORKERS_GLYPH = 3;
const HEADER_WIDTH = 100;
const NARROW_WIDTH_THRESHOLD = 50;
const FULL_WIDTH_THRESHOLD = 80;
export function hasAnimatedWorkers(state) {
    for (const worker of Object.values(state.activeWorkers)) {
        if (NON_TERMINAL_STATUSES.has(worker.status))
            return true;
    }
    return false;
}
export function getTeamStatusTip(index) {
    const normalized = Math.max(0, Math.floor(index)) % TEAM_STATUS_TIPS.length;
    return TEAM_STATUS_TIPS[normalized];
}
function getWidthTier(width) {
    if (width < NARROW_WIDTH_THRESHOLD)
        return "glyph";
    if (width < FULL_WIDTH_THRESHOLD)
        return "compact";
    return "full";
}
export function buildTeamStatusLine(state, routingMode = "team", tip, orchestratorWorking = false, theme, width = HEADER_WIDTH) {
    const tier = getWidthTier(width);
    const working = orchestratorWorking || hasActiveOrchestratorWork(state);
    const activityPlain = working ? "Working" : "Idle";
    const glyph = working ? "▶" : "○";
    if (tier === "glyph") {
        const modeGlyph = routingMode === "solo" ? "S" : "T";
        return truncateToWidth(`${modeGlyph}${glyph}`, width);
    }
    const modeLabel = routingMode === "solo" ? "Solo" : "Team";
    const compactStatus = `${modeLabel} · ${activityPlain}`;
    if (tier === "compact" || !theme)
        return truncateToWidth(tip && tier === "full" ? `${compactStatus} · Tip: ${tip}` : compactStatus, width);
    const palette = themedPalette(theme);
    const activity = working ? palette.warning("Working...") : palette.success("Idle");
    const themedStatus = routingMode === "solo" ? `Orchestrator · Solo · ${activity}` : `Orchestrator · ${activity}`;
    const line = tip ? `${themedStatus} · ${palette.dim("Tip:")} ${tip}` : themedStatus;
    return truncateToWidth(line, width);
}
function hasActiveOrchestratorWork(state) {
    return state.relayQueue.length > 0 || Object.values(state.activeWorkers).some((worker) => isActiveSurfaceWorker(worker));
}
function statusGlyph(worker, frame) {
    if (worker.status === "running")
        return SPINNER_FRAMES[frame % SPINNER_FRAMES.length];
    return getWorkerStatusGlyph(worker);
}
function buildUsageLine(state, palette, width) {
    const usage = aggregateWorkerUsage(Object.values(state.activeWorkers), state.prunedWorkerUsageTotals);
    if (!hasWorkerUsage(usage))
        return undefined;
    const base = `${palette.accent("Σ")} turns=${usage.turns} · in=${formatCompactTokenCount(usage.inputTokens)} · out=${formatCompactTokenCount(usage.outputTokens)} · $${usage.costUsd.toFixed(4)}`;
    const cache = formatCacheUsage(usage);
    if (!cache)
        return truncateToWidth(base, width);
    const cacheWithHit = formatCacheUsageWithHit(usage) ?? cache;
    const withCacheAndHit = `${palette.accent("Σ")} turns=${usage.turns} · in=${formatCompactTokenCount(usage.inputTokens)} · out=${formatCompactTokenCount(usage.outputTokens)} · ${cacheWithHit} · $${usage.costUsd.toFixed(4)}`;
    if (visibleWidth(withCacheAndHit) <= width)
        return truncateToWidth(withCacheAndHit, width);
    const withCache = `${palette.accent("Σ")} turns=${usage.turns} · in=${formatCompactTokenCount(usage.inputTokens)} · out=${formatCompactTokenCount(usage.outputTokens)} · ${cache} · $${usage.costUsd.toFixed(4)}`;
    return truncateToWidth(visibleWidth(withCache) <= width ? withCache : base, width);
}
function buildStatusRow(state, palette, width, tier = "full") {
    const counts = buildCountsLine(state, palette, width, tier);
    if (tier !== "full")
        return { row: counts, includesUsage: false };
    const usage = buildUsageLine(state, palette, width);
    if (!usage)
        return { row: counts, includesUsage: false };
    const combined = `${counts} · ${usage}`;
    return visibleWidth(combined) <= width
        ? { row: combined, includesUsage: true }
        : { row: counts, includesUsage: false };
}
function buildCountsLine(state, palette, width, tier = "full") {
    const counts = { relay: 0, running: 0, starting: 0, queued: 0, idle: 0, done: 0, ended: 0 };
    for (const worker of Object.values(state.activeWorkers)) {
        if (worker.pendingRelayQuestions.length > 0)
            counts.relay += 1;
        switch (worker.status) {
            case "running":
                counts.running += 1;
                break;
            case "starting":
                counts.starting += 1;
                break;
            case "waiting_followup":
                counts.queued += 1;
                break;
            case "idle":
                if (worker.finalAnswer)
                    counts.done += 1;
                else
                    counts.idle += 1;
                break;
            case "completed":
                counts.done += 1;
                break;
            case "aborted":
            case "error":
            case "exited":
                counts.ended += 1;
                break;
            default:
                break;
        }
    }
    if (tier === "compact") {
        const parts = [];
        const relayTotal = Math.max(counts.relay, state.relayQueue.length);
        if (relayTotal)
            parts.push(`${palette.warning("?")}${palette.warning(String(relayTotal))}`);
        if (counts.running)
            parts.push(`${palette.accent("▶")}${palette.accent(String(counts.running))}`);
        if (counts.starting)
            parts.push(`${palette.dim("◌")}${palette.dim(String(counts.starting))}`);
        if (counts.queued)
            parts.push(`${palette.warning("▸")}${palette.warning(String(counts.queued))}`);
        if (counts.idle)
            parts.push(`${palette.dim("○")}${palette.dim(String(counts.idle))}`);
        if (counts.done)
            parts.push(`${palette.success("✓")}${palette.success(String(counts.done))}`);
        if (counts.ended)
            parts.push(`${palette.danger("✗")}${palette.danger(String(counts.ended))}`);
        return truncateToWidth(parts.length === 0 ? palette.dim("no workers") : parts.join(" "), width);
    }
    if (tier === "glyph") {
        const relayTotal = Math.max(counts.relay, state.relayQueue.length);
        const parts = [];
        if (relayTotal)
            parts.push(`${palette.warning("?")}${palette.warning(String(relayTotal))}`);
        if (counts.running)
            parts.push(`${palette.accent("▶")}${palette.accent(String(counts.running))}`);
        if (counts.queued)
            parts.push(`${palette.warning("▸")}${palette.warning(String(counts.queued))}`);
        if (counts.done)
            parts.push(`${palette.success("✓")}${palette.success(String(counts.done))}`);
        if (counts.ended)
            parts.push(`${palette.danger("✗")}${palette.danger(String(counts.ended))}`);
        return truncateToWidth(parts.join(" "), width);
    }
    const parts = [];
    if (counts.relay || state.relayQueue.length)
        parts.push(`${palette.warning("?")} ${palette.warning(String(Math.max(counts.relay, state.relayQueue.length)))} relay${Math.max(counts.relay, state.relayQueue.length) === 1 ? "" : "s"}`);
    if (counts.running)
        parts.push(`${palette.accent("▶")} ${palette.accent(String(counts.running))} running`);
    if (counts.starting)
        parts.push(`${palette.dim("◌")} ${palette.dim(String(counts.starting))} starting`);
    if (counts.queued)
        parts.push(`${palette.warning("▸")} ${palette.warning(String(counts.queued))} queued`);
    if (counts.idle)
        parts.push(`${palette.dim("○")} ${palette.dim(String(counts.idle))} idle`);
    if (counts.done)
        parts.push(`${palette.success("✓")} ${palette.success(String(counts.done))} done`);
    if (counts.ended)
        parts.push(`${palette.danger("✗")} ${palette.danger(String(counts.ended))} ended`);
    return truncateToWidth(parts.length === 0 ? palette.dim("no workers tracked") : parts.join("  "), width);
}
function isActiveSurfaceWorker(worker) {
    return worker.pendingRelayQuestions.length > 0 || ACTIVE_ROW_STATUSES.has(worker.status);
}
function isRecentTerminalWorker(worker, now) {
    if (!TERMINAL_STATUSES.has(worker.status))
        return false;
    return now - worker.lastEventAt <= RECENT_TERMINAL_RETENTION_MS;
}
function shouldRenderWorker(worker, now) {
    return isActiveSurfaceWorker(worker) || isRecentTerminalWorker(worker, now);
}
function formatElapsed(ms) {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    if (seconds < 60)
        return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60)
        return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24)
        return `${hours}h`;
    return `${Math.floor(hours / 24)}d`;
}
function buildWorkerTitle(worker) {
    return worker.currentTask?.title?.trim() || worker.lastSummary?.headline?.trim() || formatWorkerStatusLabel(worker);
}
function getActiveElapsedStart(worker) {
    return worker.currentTask?.createdAt ?? worker.startedAt;
}
function buildWorkerCell(worker, frame, now, connector, palette, width, tier = "full") {
    const glyph = statusGlyph(worker, frame);
    if (tier === "glyph")
        return truncateToWidth(`${glyph}${worker.workerId}`, width, "…");
    const identity = `${palette.bold(formatProfileLabel(worker.profileName))} ${formatWorkerDisplayId(worker.workerId)}`;
    if (getWorkerAttentionPriority(worker) === "completed_or_idle") {
        const doneLabel = tier === "compact" ? palette.success("Done") : `${palette.success("Done")}`;
        return truncateToWidth(`${connector} ${glyph} ${identity} · ${doneLabel}`, width, "…");
    }
    const title = buildWorkerTitle(worker);
    const statusOrElapsed = isActiveSurfaceWorker(worker) ? formatElapsed(now - getActiveElapsedStart(worker)) : formatWorkerStatusLabel(worker);
    if (tier === "compact") {
        const compactLogical = `${glyph} ${worker.workerId} · ${title} · ${statusOrElapsed}`;
        return truncateToWidth(compactLogical, width, "…");
    }
    const logical = `${connector} ${glyph} ${identity} · ${title} · ${statusOrElapsed}`;
    return truncateToWidth(logical, width, "…");
}
function buildWorkerActivityLine(worker, hasFollowingRow, palette, width, tier = "full") {
    const attention = getWorkerAttentionDisplay(getWorkerAttentionPriority(worker));
    if (attention.key === "completed_or_idle")
        return undefined;
    const relay = worker.pendingRelayQuestions[0];
    const detail = relay?.question
        ?? worker.lastSummary?.headline
        ?? (worker.lastToolName ? `tool: ${worker.lastToolName}` : undefined)
        ?? (worker.error ? palette.danger(`error: ${worker.error}`) : undefined);
    if (!detail)
        return undefined;
    if (tier === "glyph")
        return undefined;
    if (tier === "compact") {
        const coloredLabel = attention.key === "needs_reply" ? palette.warning("!") : palette.accent("↳");
        return truncateToWidth(`  ${coloredLabel} ${detail}`, width, "…");
    }
    const gutter = hasFollowingRow ? "│" : " ";
    const coloredLabel = attention.key === "needs_reply" ? palette.warning(attention.label) : palette.accent(attention.label);
    return truncateToWidth(`${gutter}  └ ${coloredLabel}: ${detail}`, width, "…");
}
function buildAgentsSummaryLine(summaryParts, palette, width, tier = "full") {
    if (tier === "glyph") {
        return truncateToWidth(`${palette.dim("+")}${summaryParts.map((part) => part.replace(/\s+/g, "")).join("·")}`, width, "…");
    }
    if (tier === "compact") {
        return truncateToWidth(`${palette.dim("+")} ${summaryParts.join(" · ")}`, width, "…");
    }
    return truncateToWidth(`${palette.dim("└ +")} ${summaryParts.join(" · ")} ${palette.dim("· /team to view")}`, width, "…");
}
function buildWorkerLines(workers, frame, now, hasSummaryRow, palette, width, tier = "full") {
    const lines = [];
    workers.forEach((worker, index) => {
        const hasFollowingRow = tier === "full" && (index < workers.length - 1 || hasSummaryRow);
        const connector = tier === "full" ? (hasFollowingRow ? "├" : "└") : "";
        lines.push(buildWorkerCell(worker, frame, now, connector, palette, width, tier));
        const activity = buildWorkerActivityLine(worker, hasFollowingRow, palette, width, tier);
        if (activity)
            lines.push(activity);
    });
    return lines;
}
function widgetPalette(theme) {
    if (theme)
        return themedPalette(theme);
    const identity = (text) => text;
    return {
        bold: legacyBold,
        dim: identity,
        muted: identity,
        accent: identity,
        accentBold: identity,
        success: identity,
        successBold: identity,
        warning: identity,
        warningBold: identity,
        danger: identity,
        dangerBold: identity,
        inverse: identity,
    };
}
export function buildTeamWidgetLines(state, options = {}) {
    const frame = options.frame ?? 0;
    const routingMode = options.routingMode ?? "team";
    const displayCost = options.displayCost !== false;
    const now = options.now ?? Date.now();
    const width = options.width ?? HEADER_WIDTH;
    const tier = getWidthTier(width);
    const palette = widgetPalette(options.theme);
    const allWorkers = Object.values(state.activeWorkers).sort((left, right) => compareWorkerIds(left.workerId, right.workerId));
    const workers = allWorkers.filter((worker) => shouldRenderWorker(worker, now));
    if (routingMode === "solo") {
        if (allWorkers.length === 0)
            return [];
        if (tier === "glyph")
            return [truncateToWidth(`${palette.dim("Team")}${palette.dim("—solo")}`, width)];
        return [truncateToWidth(palette.dim("Pi Agents Team — solo"), width)];
    }
    if (allWorkers.length === 0 && (!displayCost || !buildUsageLine(state, palette, width)))
        return [];
    const maxWorkers = tier === "glyph" ? MAX_WIDGET_WORKERS_GLYPH : tier === "compact" ? MAX_WIDGET_WORKERS_COMPACT : MAX_WIDGET_WORKERS;
    const status = displayCost
        ? buildStatusRow(state, palette, width, tier)
        : { row: buildCountsLine(state, palette, width, tier), includesUsage: false };
    const activeCount = allWorkers.filter((worker) => isActiveSurfaceWorker(worker)).length;
    const header = tier === "glyph"
        ? `${palette.accent("T")}${palette.dim("·")}${palette.bold(String(activeCount))}${palette.dim("·")}${palette.bold(String(state.relayQueue.length))}`
        : tier === "compact"
            ? `${palette.accent("Team")} ${palette.dim("·")} a=${palette.bold(String(activeCount))} ${palette.dim("·")} r=${palette.bold(String(state.relayQueue.length))}`
            : `${palette.accent("Pi Agents Team")} ${palette.dim("·")} active=${palette.bold(String(activeCount))} ${palette.dim("·")} relays=${palette.bold(String(state.relayQueue.length))}`;
    const lines = [truncateToWidth(header, width), status.row];
    if (displayCost && !status.includesUsage && tier === "full") {
        const usageLine = buildUsageLine(state, palette, width);
        if (usageLine)
            lines.push(usageLine);
    }
    const visibleWorkers = workers.slice(0, maxWorkers);
    const hiddenByCap = workers.length - visibleWorkers.length;
    const hiddenByRetention = allWorkers.filter((worker) => TERMINAL_STATUSES.has(worker.status) && !shouldRenderWorker(worker, now)).length;
    const summaryParts = [];
    if (hiddenByCap > 0)
        summaryParts.push(`${hiddenByCap} more`);
    if (hiddenByRetention > 0)
        summaryParts.push(`${hiddenByRetention} old`);
    if (visibleWorkers.length > 0 || summaryParts.length > 0) {
        const agentsHeader = tier === "glyph"
            ? `${palette.accent("●")}${palette.bold(String(activeCount))}/${palette.bold(String(allWorkers.length))}`
            : tier === "compact"
                ? `${palette.accent("Agents")} ${palette.dim("·")} a=${palette.bold(String(activeCount))}/k=${palette.bold(String(allWorkers.length))}`
                : `${palette.accent("● Agents")} ${palette.dim("·")} active=${palette.bold(String(activeCount))} ${palette.dim("·")} tracked=${palette.bold(String(allWorkers.length))}`;
        lines.push(truncateToWidth(agentsHeader, width, "…"));
        lines.push(...buildWorkerLines(visibleWorkers, frame, now, summaryParts.length > 0, palette, width, tier));
        if (summaryParts.length > 0)
            lines.push(buildAgentsSummaryLine(summaryParts, palette, width, tier));
    }
    return lines.map((line) => truncateToWidth(line, width));
}
