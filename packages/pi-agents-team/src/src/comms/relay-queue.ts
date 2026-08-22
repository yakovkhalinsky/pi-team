export function collectPendingRelayQuestions(activeWorkers) {
    return Object.values(activeWorkers)
        .flatMap((worker) => worker.pendingRelayQuestions)
        .sort((left, right) => left.createdAt - right.createdAt)
        .map((question) => ({ ...question }));
}
