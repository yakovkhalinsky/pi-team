import { matchesKey, truncateToWidth } from "@earendil-works/pi-tui";
import { buildCompactTeamSummaryLine } from "./dashboard.js";
import { formatAgentMessageResult } from "./tool-formatters.js";
import { themedPalette } from "./theme.js";
import {
    setPalette,
    buildTabBar,
    buildSelectedWorkerHeader,
    formatFollowHeader,
    RosterSelectList,
    buildInspectText,
    buildConsoleLines,
    buildCostLines,
    wrapLines,
    enforceWidth,
} from "./overlay.js";
import { DASHBOARD_TAB_ORDER } from "./inline-dashboard-state.js";

const MAX_WIDGET_ROWS = 12;
const DEFAULT_WIDGET_WIDTH = 160;

function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}

export class TeamDashboardWidget {
    ctx;
    teamManager;
    state;
    options;
    displayCost;
    widgetKey;

    constructor(ctx, teamManager, state, options = {}) {
        this.ctx = ctx;
        this.teamManager = teamManager;
        this.state = state;
        this.options = options;
        this.displayCost = options.displayCost !== false;
        this.widgetKey = options.widgetKey || "pi-agent-team-dashboard";
    }

    setContext(ctx) {
        this.ctx = ctx;
    }

    isActive() {
        return this.state.active;
    }

    refresh() {
        if (!this.ctx?.hasUI)
            return;
        if (!this.state.active || this.ctx.mode !== "tui") {
            this.ctx.ui.setWidget(this.widgetKey, undefined);
            return;
        }
        this.ctx.ui.setWidget(this.widgetKey, (_tui, theme) => ({
            render: (width) => this.render(width, theme),
            invalidate: () => { },
        }), { placement: "belowEditor" });
    }

    clear() {
        if (this.ctx?.hasUI)
            this.ctx.ui.setWidget(this.widgetKey, undefined);
    }

    render(width, theme) {
        const cap = Math.max(1, Math.min(width || 80, DEFAULT_WIDGET_WIDTH));
        const palette = themedPalette(theme);
        setPalette(theme);
        const snapshot = this.teamManager.snapshot();
        this.state.ensureSelectedWorker(snapshot);
        const routingMode = this.teamManager.routingMode ?? "team";
        const visibleTabs = this.displayCost ? DASHBOARD_TAB_ORDER : DASHBOARD_TAB_ORDER.filter((tab) => tab !== "cost");
        const tabBar = buildTabBar(this.state.tab, routingMode, this.displayCost);
        const summary = buildCompactTeamSummaryLine(snapshot, theme);
        const worker = this.state.currentWorker(snapshot);
        const selectedHeader = buildSelectedWorkerHeader(worker, cap);
        const headerLines = [tabBar, summary, selectedHeader];
        const footerLines = [this.buildFooter(cap, visibleTabs)];
        const bodyRows = Math.max(1, MAX_WIDGET_ROWS - headerLines.length - footerLines.length);
        const body = this.renderBody(cap, bodyRows, snapshot, palette);
        const lines = [...headerLines, ...body, ...footerLines];
        return lines.slice(0, MAX_WIDGET_ROWS).map((line) => truncateToWidth(line, cap, "…"));
    }

    buildFooter(width, visibleTabs) {
        const tabHint = visibleTabs.length === 4 ? "1-4" : "1-3";
        const base = this.state.tab === "console"
            ? `${tabHint} tab · j/k scroll · space page · f follow · r raw · s steer · m msg · n new · p prune · q/Esc close`
            : `${tabHint} tab · j/k scroll · space page · f follow · r refresh · s steer · m msg · n new · p prune · q/Esc close`;
        return truncateToWidth(base, width, "…");
    }

    renderBody(width, rows, snapshot, palette) {
        if (rows <= 0)
            return [];
        switch (this.state.tab) {
            case "workers":
                return this.renderWorkersBody(width, rows, snapshot);
            case "inspect":
                return this.renderInspectBody(width, rows, snapshot, palette);
            case "console":
                return this.renderConsoleBody(width, rows, snapshot);
            case "cost":
                return this.renderCostBody(width, rows, snapshot);
        }
        return [];
    }

    renderWorkersBody(width, rows, snapshot) {
        const roster = new RosterSelectList(snapshot, this.state.selectedWorkerId);
        const lines = roster.render(width, rows);
        this.state.lastListPageSize = Math.max(1, rows - 1);
        return enforceWidth(lines, width).slice(0, rows);
    }

    renderInspectBody(width, rows, snapshot, palette) {
        const worker = this.state.currentWorker(snapshot);
        if (!worker)
            return enforceWidth(["No worker selected"], width).slice(0, rows);
        const text = buildInspectText(worker, this.teamManager.getWorkerTranscript(worker.workerId), this.teamManager.getWorkerConsole(worker.workerId), this.teamManager.getWorkerActivity?.(worker.workerId), palette);
        const all = wrapLines(text, width);
        const visible = Math.max(1, rows - 1);
        const maxTop = Math.max(0, all.length - visible);
        if (this.state.inspectFollow)
            this.state.inspectScroll = maxTop;
        const top = clamp(this.state.inspectScroll, 0, maxTop);
        this.state.inspectScroll = top;
        this.state.lastBodyPageSize = visible;
        const header = formatFollowHeader(this.state.inspectFollow, top, visible, all.length);
        return enforceWidth([header, ...all.slice(top, top + visible)], width).slice(0, rows);
    }

    renderConsoleBody(width, rows, snapshot) {
        const worker = this.state.currentWorker(snapshot);
        if (!worker)
            return enforceWidth(["No worker selected"], width).slice(0, rows);
        const chunks = this.teamManager.getAssistantTail(worker.workerId);
        const events = this.teamManager.getWorkerConsole(worker.workerId) ?? [];
        const activity = this.teamManager.getWorkerActivity?.(worker.workerId);
        const text = buildConsoleLines(worker, chunks, events, activity, this.state.consoleMode).join("\n");
        const all = wrapLines(text, width);
        const visible = Math.max(1, rows - 1);
        const maxTop = Math.max(0, all.length - visible);
        if (this.state.consoleFollow)
            this.state.consoleScroll = maxTop;
        const top = clamp(this.state.consoleScroll, 0, maxTop);
        this.state.consoleScroll = top;
        this.state.lastBodyPageSize = visible;
        const header = formatFollowHeader(this.state.consoleFollow, top, visible, all.length);
        return enforceWidth([header, ...all.slice(top, top + visible)], width).slice(0, rows);
    }

    renderCostBody(width, rows, snapshot) {
        const all = wrapLines(buildCostLines(snapshot).join("\n"), width);
        const maxTop = Math.max(0, all.length - rows);
        const top = Math.min(this.state.costScroll, maxTop);
        this.state.costScroll = top;
        this.state.lastBodyPageSize = rows;
        return enforceWidth(all.slice(top, top + rows), width).slice(0, rows);
    }

    handleInput(data) {
        if (!this.state.active)
            return false;
        if (data === "q" || matchesKey(data, "escape")) {
            this.state.setActive(false);
            this.clear();
            return true;
        }
        const numIdx = ["1", "2", "3", "4"].indexOf(data);
        if (numIdx >= 0) {
            const tab = DASHBOARD_TAB_ORDER[numIdx];
            const visibleTabs = this.displayCost ? DASHBOARD_TAB_ORDER : DASHBOARD_TAB_ORDER.filter((t) => t !== "cost");
            if (tab && visibleTabs.includes(tab)) {
                this.state.setTab(tab);
                this.refresh();
            }
            return true;
        }
        const snapshot = this.teamManager.snapshot();
        if (data === "j" || matchesKey(data, "down")) {
            if (this.state.tab === "workers")
                this.state.moveSelection(1, snapshot);
            else
                this.state.scrollBy(1);
            this.refresh();
            return true;
        }
        if (data === "k" || matchesKey(data, "up")) {
            if (this.state.tab === "workers")
                this.state.moveSelection(-1, snapshot);
            else
                this.state.scrollBy(-1);
            this.refresh();
            return true;
        }
        if (data === " " || matchesKey(data, "pageDown") || matchesKey(data, "ctrl+d")) {
            if (this.state.tab === "workers")
                this.state.moveSelection(this.state.lastListPageSize || 4, snapshot);
            else
                this.state.page(this.state.lastBodyPageSize || 6, snapshot);
            this.refresh();
            return true;
        }
        if (data === "b" || matchesKey(data, "pageUp") || matchesKey(data, "ctrl+u")) {
            if (this.state.tab === "workers")
                this.state.moveSelection(-(this.state.lastListPageSize || 4), snapshot);
            else
                this.state.pageUp(this.state.lastBodyPageSize || 6, snapshot);
            this.refresh();
            return true;
        }
        if (data === "g" || matchesKey(data, "home")) {
            if (this.state.tab === "workers")
                this.state.moveToFirst(snapshot);
            else
                this.state.scrollToTop();
            this.refresh();
            return true;
        }
        if (data === "G" || matchesKey(data, "end")) {
            if (this.state.tab === "workers")
                this.state.moveToLast(snapshot);
            else
                this.state.scrollToBottom();
            this.refresh();
            return true;
        }
        if (data === "f" || matchesKey(data, "alt+f")) {
            this.state.toggleFollow();
            this.refresh();
            return true;
        }
        if (data === "r") {
            if (this.state.tab === "console") {
                this.state.toggleConsoleMode();
            }
            else {
                this.refreshSnapshot();
            }
            this.refresh();
            return true;
        }
        if (data === "s") {
            this.steerCurrent();
            return true;
        }
        if (data === "m") {
            this.messageCurrent();
            return true;
        }
        if (data === "n") {
            void this.newTask();
            return true;
        }
        if (data === "p") {
            void this.pruneTerminal();
            return true;
        }
        return false;
    }

    refreshSnapshot() {
        this.teamManager.pingWorkers({ mode: "active" })
            .then(() => {
            this.refresh();
            if (this.ctx?.hasUI)
                this.ctx.ui.notify("Team dashboard refreshed", "info");
        })
            .catch((error) => {
            if (this.ctx?.hasUI)
                this.ctx.ui.notify(`Refresh failed: ${error instanceof Error ? error.message : String(error)}`, "warning");
        });
    }

    steerCurrent() {
        const snapshot = this.teamManager.snapshot();
        const worker = this.state.currentWorker(snapshot);
        if (!worker) {
            if (this.ctx?.hasUI)
                this.ctx.ui.notify("Select a worker first", "warning");
            return;
        }
        const label = `Steer ${worker.workerId}: `;
        this.ctx.ui.input(label, "").then((value) => {
            if (!value?.trim())
                return;
            this.teamManager.messageWorker(worker.workerId, value.trim(), "steer")
                .then((result) => {
                if (this.ctx?.hasUI)
                    this.ctx.ui.notify(formatAgentMessageResult(result) || `Steered ${worker.workerId}`, "info");
            })
                .catch((error) => {
                if (this.ctx?.hasUI)
                    this.ctx.ui.notify(`Steer failed: ${error instanceof Error ? error.message : String(error)}`, "error");
            });
        });
    }

    messageCurrent() {
        const snapshot = this.teamManager.snapshot();
        const worker = this.state.currentWorker(snapshot);
        if (!worker) {
            if (this.ctx?.hasUI)
                this.ctx.ui.notify("Select a worker first", "warning");
            return;
        }
        const label = `Message ${worker.workerId}: `;
        this.ctx.ui.input(label, "").then((value) => {
            if (!value?.trim())
                return;
            this.teamManager.messageWorker(worker.workerId, value.trim(), "auto")
                .then((result) => {
                if (this.ctx?.hasUI)
                    this.ctx.ui.notify(formatAgentMessageResult(result) || `Messaged ${worker.workerId}`, "info");
            })
                .catch((error) => {
                if (this.ctx?.hasUI)
                    this.ctx.ui.notify(`Message failed: ${error instanceof Error ? error.message : String(error)}`, "error");
            });
        });
    }

    async newTask() {
        const config = this.options.config;
        if (!config?.profiles?.length) {
            if (this.ctx?.hasUI)
                this.ctx.ui.notify("No profiles available", "warning");
            return;
        }
        if (this.teamManager.routingMode === "solo") {
            if (this.ctx?.hasUI)
                this.ctx.ui.notify("Team routing off. Run /team-enable on to delegate.", "warning");
            return;
        }
        const profileNames = config.profiles.map((profile) => profile.name);
        const profile = await this.ctx.ui.select("Profile", profileNames);
        if (!profile)
            return;
        const goal = await this.ctx.ui.input(`New ${profile} task: `, "");
        if (!goal?.trim())
            return;
        try {
            await this.teamManager.delegateTask({
                title: goal.trim().slice(0, 60),
                goal: goal.trim(),
                profileName: profile,
                cwd: this.options.cwd || process.cwd(),
            });
            if (this.ctx?.hasUI)
                this.ctx.ui.notify(`Created ${profile} task`, "info");
        }
        catch (error) {
            if (this.ctx?.hasUI)
                this.ctx.ui.notify(`Delegation failed: ${error instanceof Error ? error.message : String(error)}`, "error");
        }
    }

    async pruneTerminal() {
        try {
            const removed = await this.teamManager.pruneTerminalWorkers();
            if (this.ctx?.hasUI) {
                if (removed.length === 0) {
                    this.ctx.ui.notify("No terminal workers to prune", "info");
                }
                else {
                    this.ctx.ui.notify(`Pruned ${removed.length} terminal worker(s)`, "info");
                }
            }
            this.refresh();
        }
        catch (error) {
            if (this.ctx?.hasUI)
                this.ctx.ui.notify(`Prune failed: ${error instanceof Error ? error.message : String(error)}`, "error");
        }
    }
}
