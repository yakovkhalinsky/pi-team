import { openTeamDashboardOverlay } from "../ui/overlay.js";
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
            const openOverlay = async (initialWorkerId) => {
                await openTeamDashboardOverlay(ctx, dependencies.teamManager, {
                    initialWorkerId,
                    displayCost: dependencies.teamManager.displayCost,
                    emitText: (text) => dependencies.emitText(ctx, text),
                });
            };
            if (!input) {
                if (ctx.mode === "tui")
                    await openOverlay();
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
                await openOverlay(workerId);
            else
                await emitDashboardText();
        },
    });
}
