import { createDefaultTeamState, normalizePersistedTeamState } from "../config.js";
import { collectPendingRelayQuestions } from "../comms/relay-queue.js";
import { compareWorkerIds } from "../types.js";
import { addWorkerUsageToAggregate } from "../usage.js";
export class TaskRegistry {
    state;
    constructor(initialState) {
        this.state = normalizePersistedTeamState(initialState ?? createDefaultTeamState());
        this.refreshDerivedState();
    }
    restore(nextState) {
        this.state = normalizePersistedTeamState(nextState);
        this.refreshDerivedState();
    }
    registerTask(task) {
        this.state.taskRegistry[task.taskId] = { ...task };
        this.touch();
    }
    unregisterTask(taskId) {
        delete this.state.taskRegistry[taskId];
        this.touch();
    }
    upsertWorker(worker) {
        this.state.activeWorkers[worker.workerId] = structuredClone(worker);
        this.touch();
    }
    markWorkerExited(workerId, reason) {
        const worker = this.state.activeWorkers[workerId];
        if (!worker)
            return undefined;
        worker.status = "exited";
        worker.error = reason;
        worker.lastEventAt = Date.now();
        if (worker.lastSummary) {
            worker.lastSummary.status = "exited";
            worker.lastSummary.headline = reason;
            worker.lastSummary.updatedAt = worker.lastEventAt;
        }
        this.touch();
        return structuredClone(worker);
    }
    removeWorker(workerId) {
        const worker = this.state.activeWorkers[workerId];
        if (!worker)
            return undefined;
        this.state.prunedWorkerUsageTotals = addWorkerUsageToAggregate(this.state.prunedWorkerUsageTotals, worker.usage);
        delete this.state.activeWorkers[workerId];
        if (worker.currentTask?.taskId) {
            delete this.state.taskRegistry[worker.currentTask.taskId];
        }
        this.touch();
        return structuredClone(worker);
    }
    listWorkers() {
        return Object.values(this.state.activeWorkers)
            .sort((left, right) => compareWorkerIds(left.workerId, right.workerId))
            .map((worker) => structuredClone(worker));
    }
    getWorker(workerId) {
        const worker = this.state.activeWorkers[workerId];
        return worker ? structuredClone(worker) : undefined;
    }
    getTask(taskId) {
        const task = this.state.taskRegistry[taskId];
        return task ? { ...task } : undefined;
    }
    getPrunedWorkerUsageTotals() {
        return structuredClone(this.state.prunedWorkerUsageTotals);
    }
    snapshot() {
        this.refreshDerivedState();
        return structuredClone(this.state);
    }
    touch() {
        this.state.updatedAt = Date.now();
        this.refreshDerivedState();
    }
    refreshDerivedState() {
        this.state.ui.lastRenderAt = Date.now();
        this.state.relayQueue = collectPendingRelayQuestions(this.state.activeWorkers);
    }
}
