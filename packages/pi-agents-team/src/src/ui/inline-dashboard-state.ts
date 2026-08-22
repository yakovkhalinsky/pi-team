import { buildRosterSections } from "./dashboard.js";

export const DASHBOARD_TAB_ORDER = ["workers", "inspect", "console", "cost"];

export function getAttentionOrderedWorkerIds(state) {
    return buildRosterSections(state).flatMap((section) => section.workers.map((worker) => worker.workerId));
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}

export class InlineDashboardState {
    active = false;
    tab = "workers";
    selectedWorkerId = undefined;
    inspectScroll = 0;
    inspectFollow = false;
    consoleScroll = 0;
    consoleFollow = true;
    consoleMode = "activity";
    costScroll = 0;
    lastListPageSize = 4;
    lastBodyPageSize = 6;

    toggleActive() {
        this.active = !this.active;
        if (!this.active) {
            this.inspectFollow = false;
            this.consoleFollow = false;
        }
        return this.active;
    }

    setActive(value) {
        this.active = Boolean(value);
        if (!this.active) {
            this.inspectFollow = false;
            this.consoleFollow = false;
        }
        return this.active;
    }

    currentWorker(state) {
        if (!this.selectedWorkerId)
            return undefined;
        return state.activeWorkers[this.selectedWorkerId];
    }

    ensureSelectedWorker(state) {
        const ids = getAttentionOrderedWorkerIds(state);
        if (ids.length === 0) {
            this.selectedWorkerId = undefined;
            return;
        }
        if (this.selectedWorkerId && state.activeWorkers[this.selectedWorkerId])
            return;
        this.selectedWorkerId = ids[0];
        this.inspectScroll = 0;
        this.inspectFollow = false;
        this.consoleScroll = 0;
        this.consoleFollow = true;
        this.consoleMode = "activity";
    }

    selectWorker(workerId) {
        this.selectedWorkerId = workerId;
        this.inspectScroll = 0;
        this.inspectFollow = false;
        this.consoleScroll = 0;
        this.consoleFollow = true;
        this.consoleMode = "activity";
    }

    setTab(tab) {
        if (!DASHBOARD_TAB_ORDER.includes(tab))
            return;
        this.tab = tab;
    }

    moveSelection(delta, state) {
        const ids = getAttentionOrderedWorkerIds(state);
        if (ids.length === 0)
            return;
        const current = this.selectedWorkerId ? ids.indexOf(this.selectedWorkerId) : 0;
        const safe = current >= 0 ? current : 0;
        const next = clamp(safe + delta, 0, ids.length - 1);
        if (this.selectedWorkerId !== ids[next]) {
            this.selectedWorkerId = ids[next];
            this.inspectScroll = 0;
            this.inspectFollow = false;
            this.consoleScroll = 0;
            this.consoleFollow = true;
        }
    }

    moveToFirst(state) {
        const ids = getAttentionOrderedWorkerIds(state);
        if (ids.length === 0)
            return;
        this.selectedWorkerId = ids[0];
        this.inspectScroll = 0;
        this.inspectFollow = false;
        this.consoleScroll = 0;
        this.consoleFollow = true;
    }

    moveToLast(state) {
        const ids = getAttentionOrderedWorkerIds(state);
        if (ids.length === 0)
            return;
        this.selectedWorkerId = ids[ids.length - 1];
        this.inspectScroll = 0;
        this.inspectFollow = false;
        this.consoleScroll = 0;
        this.consoleFollow = true;
    }

    scrollBy(delta) {
        if (this.tab === "inspect") {
            this.inspectScroll = Math.max(0, this.inspectScroll + delta);
            this.inspectFollow = false;
        }
        else if (this.tab === "console") {
            this.consoleScroll = Math.max(0, this.consoleScroll + delta);
            this.consoleFollow = false;
        }
        else if (this.tab === "cost") {
            this.costScroll = Math.max(0, this.costScroll + delta);
        }
    }

    scrollToTop() {
        if (this.tab === "inspect") {
            this.inspectScroll = 0;
            this.inspectFollow = false;
        }
        else if (this.tab === "console") {
            this.consoleScroll = 0;
            this.consoleFollow = false;
        }
        else if (this.tab === "cost") {
            this.costScroll = 0;
        }
    }

    scrollToBottom() {
        if (this.tab === "inspect") {
            this.inspectFollow = true;
        }
        else if (this.tab === "console") {
            this.consoleFollow = true;
        }
        else if (this.tab === "cost") {
            this.costScroll = Number.MAX_SAFE_INTEGER;
        }
    }

    page(pageSize, state) {
        const delta = Math.max(1, pageSize);
        if (this.tab === "workers") {
            this.moveSelection(delta, state);
        }
        else {
            this.scrollBy(delta);
        }
    }

    pageUp(pageSize, state) {
        const delta = -Math.max(1, pageSize);
        if (this.tab === "workers") {
            this.moveSelection(delta, state);
        }
        else {
            this.scrollBy(delta);
        }
    }

    toggleFollow() {
        if (this.tab === "inspect")
            this.inspectFollow = !this.inspectFollow;
        else if (this.tab === "console")
            this.consoleFollow = !this.consoleFollow;
    }

    toggleConsoleMode() {
        this.consoleMode = this.consoleMode === "activity" ? "raw" : "activity";
        this.consoleScroll = 0;
        this.consoleFollow = false;
    }
}
