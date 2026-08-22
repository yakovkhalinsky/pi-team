import { spawn } from "node:child_process";
import { platform } from "node:os";
function pickProviders() {
    switch (platform()) {
        case "darwin":
            return [{ command: "pbcopy", args: [] }];
        case "win32":
            return [{ command: "clip.exe", args: [] }];
        default:
            return [
                { command: "wl-copy", args: [] },
                { command: "xclip", args: ["-selection", "clipboard"] },
                { command: "xsel", args: ["--clipboard", "--input"] },
            ];
    }
}
async function tryProvider(provider, text) {
    await new Promise((resolve, reject) => {
        const child = spawn(provider.command, provider.args, { stdio: ["pipe", "ignore", "pipe"] });
        let stderr = "";
        child.on("error", reject);
        child.stderr?.on("data", (chunk) => {
            stderr += chunk.toString();
        });
        child.on("close", (code) => {
            if (code === 0) {
                resolve();
                return;
            }
            reject(new Error(`${provider.command} exited with code ${code}${stderr ? `: ${stderr.trim()}` : ""}`));
        });
        child.stdin?.end(text, "utf8");
    });
}
export async function copyToClipboard(text) {
    const providers = pickProviders();
    const errors = [];
    for (const provider of providers) {
        try {
            await tryProvider(provider, text);
            return;
        }
        catch (error) {
            errors.push(`${provider.command}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    throw new Error(`No clipboard provider available. Tried: ${errors.join("; ")}`);
}
