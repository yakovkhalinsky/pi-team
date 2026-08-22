export function resolveWorkerMessageDelivery(status, delivery = "auto") {
    if (status !== "running")
        return "prompt";
    if (delivery === "follow_up")
        return "follow_up";
    return "steer";
}
