import { exec, spawn } from "node:child_process";
import { platform } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const root = path.join(import.meta.dirname, "..");
const serverScript = path.join(import.meta.dirname, "app.js");
const hostUrl = "http://127.0.0.1:3000/host.html";

const server = spawn(process.execPath, [serverScript], {
    cwd: root,
    stdio: ["ignore", "inherit", "inherit"],
});
server.on("error", (error) => {
    console.error(error.message);
    stop(1);
});

let stopping = false;

function stop(code = 0) {
    if (stopping) {
        return;
    }
    stopping = true;
    server.kill("SIGINT");
    setTimeout(() => process.exit(code), 300).unref();
}

function openHost() {
    const command = platform() === "darwin"
        ? `open "${hostUrl}"`
        : platform() === "win32"
            ? `start "" "${hostUrl}"`
            : `xdg-open "${hostUrl}"`;
    exec(command);
}

async function waitForServer() {
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
        if (server.exitCode !== null) {
            process.exit(server.exitCode || 1);
        }
        try {
            const response = await fetch("http://127.0.0.1:3000/status");
            if (response.ok) {
                return;
            }
        } catch {
            // still booting
        }
        await sleep(100);
    }
    console.error("Timed out waiting for the chat server");
    stop(1);
}

server.on("exit", (code) => {
    if (!stopping) {
        stop(code ?? 1);
    }
});
process.on("SIGINT", () => stop(130));
process.on("SIGTERM", () => stop(143));

await waitForServer();
openHost();
