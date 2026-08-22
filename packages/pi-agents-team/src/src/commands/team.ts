import { buildTeamDashboardText } from "../ui/dashboard.js";
import { formatCommandWarning } from "../ui/display-grammar.js";
import { formatUnknownWorker, suggestTargets } from "../util/suggest.js";

export function registerTeamCommand(pi, dependencies) {
    pi.registerCommand("team", {
        description: "Open the Pi Agents Team dashboard: /team or /team <worker-id>",
        getArgumentCompletions: (prefix) => {
            if (/\s/.test(prefix))
                return [];
            return dependencies.teamManager
                .listWorkers()
                .filter((worker) => worker.workerId.startsWith(prefix))
                .map((worker) => ({
                value: worker.workerId,
                label: worker.workerId,
                description: `${worker.profileName} · ${worker.status}${worker.currentTask?.title ? ` · ${worker.currentTask.title}` : ""}`,
            }));
        },
        handler: async (args, ctx) => {
            const input = args.trim();
            const emitDashboardText = async () => {
                await dependencies.teamManager.pingWorkers({ mode: "active" }).catch(() => { });
                dependencies.emitText(ctx, buildTeamDashboardText(dependencies.teamManager.snapshot(), {
                    displayCost: dependencies.teamManager.displayCost,
                }));
            };
            const toggleInlineDashboard = (workerId) => {
                if (typeof dependencies.toggleInlineDashboard !== "function")
                    return;
                dependencies.toggleInlineDashboard(ctx, workerId);
            };
            if (!input) {
                if (ctx.mode === "tui")
                    toggleInlineDashboard();
                else
                    await emitDashboardText();
                return;
            }
            const workerId = dependencies.teamManager.resolveWorkerId(input);
            if (!workerId) {
                const candidates = dependencies.teamManager.listWorkers().map((worker) => worker.workerId);
                const warning = formatCommandWarning(formatUnknownWorker(input, suggestTargets(input, candidates)));
                if (ctx.mode === "tui")
                    ctx.ui.notify(warning, "warning");
                else
                    dependencies.emitText(ctx, warning);
                return;
            }
            if (ctx.mode === "tui")
                toggleInlineDashboard(workerId);
            else
                await emitDashboardText();
        },
    });
}
