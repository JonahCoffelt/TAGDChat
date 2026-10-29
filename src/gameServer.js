import http from "node:http"
import fs from "node:fs"
import path from "node:path"
import crypto from "node:crypto"
import { spawnSync } from "node:child_process"
import { WebSocket, WebSocketServer } from "ws"
import { Tunnel, bin, install } from "cloudflared"
import QRCode from "qrcode"

const CONTENT_TYPES = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".png": "image/png",
}

class ConnectedClient {
    constructor(id, ip, socket) {
        this.id = id;
        this.ip = ip;
        this.socket = socket;
    }

    send(type, data = null) {
        this.sendMessage({ type, data });
    }

    sendMessage(message) {
        if (this.socket.readyState !== WebSocket.OPEN) {
            return;
        }
        this.socket.send(JSON.stringify(message));
    }

    close() {
        this.socket.close();
    }
}

class GameServer {
    constructor({ port = 3000, publicDir = null, clientRoute = "/gameClient.js", tunnelTimeout = 20000, qr = "qr.png" } = {}) {
        this.port = port;
        this.publicDir = publicDir ? path.resolve(publicDir) : null;
        this.clientRoute = clientRoute;
        this.tunnelTimeout = tunnelTimeout;
        this.qr = qr === true ? "qr.png" : qr;
        this.clientFile = path.join(import.meta.dirname, "gameClient.js");

        this.url = null;
        this.tunnel = null;

        this.typeHandlers = new Map();
        this.responders = new Map();
        this.connectionHandlers = [];
        this.disconnectHandlers = [];
        this.clients = new Set();

        this.createHttpServer();
        this.createWebSocketServer();
    }

    createHttpServer() {
        this.http_server = http.createServer((req, res) => {
            const urlPath = req.url.split("?")[0];

            // Server status
            if (urlPath === "/status") {
                res.end("Server is running\n");
                return;
            }

            if (urlPath === "/qr.png") {
                this.sendQr(res);
                return;
            }

            // The browser client lives in this package, not in the consumer's public directory
            if (urlPath === this.clientRoute) {
                this.sendFile(res, this.clientFile);
                return;
            }

            if (!this.publicDir) {
                res.statusCode = 404;
                res.end("Not found");
                return;
            }

            const filePath = path.join(this.publicDir, urlPath === "/" ? "index.html" : urlPath);

            if (!filePath.startsWith(this.publicDir + path.sep)) {
                res.statusCode = 403;
                res.end("Forbidden");
                return;
            }

            this.sendFile(res, filePath);
        })
    }

    sendQr(res) {
        if (!this.url) {
            res.statusCode = 404;
            res.end("Tunnel not ready");
            return;
        }

        QRCode.toBuffer(this.url, { width: 512, margin: 2 }).then((png) => {
            res.setHeader("Content-Type", "image/png");
            res.setHeader("Cache-Control", "no-store");
            res.end(png);
        }).catch(() => {
            res.statusCode = 500;
            res.end("Could not make QR code");
        });
    }

    sendFile(res, filePath) {
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.statusCode = 404;
                res.end("Not found");
                return;
            }
            res.setHeader("Content-Type", CONTENT_TYPES[path.extname(filePath)] || "text/plain");
            res.end(data);
        })
    }

    createWebSocketServer() {
        this.ws_server = new WebSocketServer({ server: this.http_server });

        this.ws_server.on("connection", (ws, req) => {
            const ip = this.clientAddress(req);
            const client = new ConnectedClient(this.clientId(ip), ip, ws);
            this.clients.add(client);

            for (const handler of this.connectionHandlers) {
                handler(client);
            }

            ws.on("message", (raw) => {
                this.handleMessage(raw.toString(), client);
            })

            ws.on("close", () => {
                this.clients.delete(client);

                for (const handler of this.disconnectHandlers) {
                    handler(client);
                }
            })
        })
    }

    clientAddress(req) {
        // Traffic arrives from the local cloudflared process, so the socket address is always
        // loopback and the real address has to come from the header Cloudflare sets
        const forwarded = req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"];

        if (forwarded) {
            return forwarded.split(",")[0].trim();
        }

        return req.socket.remoteAddress ?? "";
    }

    clientId(ip) {
        // Hashed because ids are shared
        const address = ip.replace(/^::ffff:/, "");
        return crypto.createHash("sha256").update(address).digest("hex").slice(0, 12);
    }

    handleMessage(raw, client) {
        let message;

        try {
            message = JSON.parse(raw);
        } catch {
            console.warn("Ignoring message that is not valid JSON: ", raw);
            return;
        }

        if (message.requestId !== undefined) {
            this.handleRequest(message, client);
            return;
        }

        for (const handler of this.typeHandlers.get(message.type) ?? []) {
            handler(message.data, client);
        }
    }

    async handleRequest(message, client) {
        const { type, requestId } = message;
        const responder = this.responders.get(type);

        if (!responder) {
            client.sendMessage({ type, requestId, error: `No responder for "${type}"` });
            return;
        }

        try {
            const data = await responder(message.data, client);
            client.sendMessage({ type, requestId, data });
        } catch (error) {
            client.sendMessage({ type, requestId, error: error.message });
        }
    }

    on(type, handler) {
        const handlers = this.typeHandlers.get(type) ?? [];
        handlers.push(handler);
        this.typeHandlers.set(type, handlers);
    }

    respond(type, responder) {
        this.responders.set(type, responder);
    }

    onConnection(handler) {
        this.connectionHandlers.push(handler);
    }

    onDisconnect(handler) {
        this.disconnectHandlers.push(handler);
    }

    broadcast(type, data = null) {
        for (const client of this.clients) {
            client.send(type, data);
        }
    }

    async start() {
        await new Promise((resolve) => this.http_server.listen(this.port, resolve));

        this.url = await this.startTunnel();
        console.log(`Game available at ${this.url}`);

        if (this.qr) {
            const file = await this.writeQrCode();
            console.log(`QR code saved to ${file}, scan it to join from a phone`);
        }

        return this.url;
    }

    async writeQrCode(file = this.qr) {
        const target = path.resolve(file);

        await QRCode.toFile(target, this.url, { width: 512, margin: 2 });

        return target;
    }

    cloudflaredWorks() {
        if (!fs.existsSync(bin)) {
            return false;
        }

        try {
            fs.accessSync(bin, fs.constants.X_OK);
        } catch {
            try {
                fs.chmodSync(bin, 0o755);
            } catch {
                return false;
            }
        }

        const result = spawnSync(bin, ["--version"], { encoding: "utf8" });
        return result.status === 0;
    }

    async startTunnel() {
        // The npm postinstall normally fetches this, but it can be skipped or blocked
        if (!this.cloudflaredWorks()) {
            console.log("Downloading cloudflared...");
            await install(bin);
        }

        let url;

        try {
            // http2 over TCP 443 is more reliable than QUIC (UDP 7844) on campus/phone networks
            url = await this.openTunnel({ "--protocol": "http2" });
        } catch (error) {
            console.warn(`Tunnel could not connect over http2 (${error.message})`);
            console.warn("Retrying over QUIC...");
            url = await this.openTunnel({});
        }

        this.tunnel.on("error", (error) => {
            console.error(`cloudflared error: ${error.message}`);
        });

        this.tunnel.on("exit", (code) => {
            console.error(`cloudflared exited with code ${code}, ${url} is no longer reachable`);
        });

        // cloudflared outlives its parent, so without this a killed server leaves the tunnel
        // running and the local port still published
        const tunnel = this.tunnel;
        process.once("exit", () => tunnel.stop());

        for (const signal of ["SIGINT", "SIGTERM"]) {
            process.once(signal, () => {
                tunnel.stop();
                process.exit(signal === "SIGINT" ? 130 : 143);
            });
        }

        return url;
    }

    openTunnel(options) {
        const tunnel = Tunnel.quick(`http://localhost:${this.port}`, options);
        const output = [];

        this.tunnel = tunnel;

        return new Promise((resolve, reject) => {
            let url = null;

            const onOutput = (line) => {
                output.push(line.trim());
                if (output.length > 8) {
                    output.shift();
                }
            };
            const onUrl = (value) => { url = value; };
            const onConnected = () => finish(null);
            const onError = (error) => finish(error);
            const onExit = (code) => finish(new Error(`cloudflared exited with code ${code}`));

            // A URL is printed before the edge connections exist, so it is not proof of anything
            const timer = setTimeout(() => {
                finish(new Error("timed out waiting for the tunnel to reach Cloudflare"));
            }, this.tunnelTimeout);

            const finish = (error) => {
                clearTimeout(timer);
                tunnel.off("stderr", onOutput);
                tunnel.off("url", onUrl);
                tunnel.off("connected", onConnected);
                tunnel.off("error", onError);
                tunnel.off("exit", onExit);

                if (error) {
                    tunnel.stop();
                    error.message += output.length ? `\ncloudflared said:\n  ${output.join("\n  ")}` : "";
                    reject(error);
                    return;
                }

                resolve(url);
            };

            tunnel.on("stderr", onOutput);
            tunnel.on("url", onUrl);
            tunnel.once("connected", onConnected);
            tunnel.once("error", onError);
            tunnel.once("exit", onExit);
        });
    }

    async stop() {
        this.tunnel?.stop();
        this.tunnel = null;
        this.url = null;

        for (const client of this.clients) {
            client.socket.terminate();
        }

        this.ws_server.close();
        await new Promise((resolve) => this.http_server.close(resolve));
    }

}

export default GameServer;
