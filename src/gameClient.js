class GameClient {
    constructor(host = location.host, { reconnect = true, reconnectDelay = 500, maxReconnectDelay = 10000, requestTimeout = 5000 } = {}) {
        this.host = host;
        this.reconnect = reconnect;
        this.reconnectDelay = reconnectDelay;
        this.maxReconnectDelay = maxReconnectDelay;
        this.requestTimeout = requestTimeout;

        this.typeHandlers = new Map();
        this.openHandlers = [];
        this.pending = [];
        this.pendingRequests = new Map();
        this.nextRequestId = 1;

        this.retryDelay = reconnectDelay;
        this.reconnectTimer = null;

        this.openSocket();
    }

    openSocket() {
        const scheme = location.protocol === "https:" ? "wss" : "ws";
        this.socket = new WebSocket(`${scheme}://${this.host}`);

        this.socket.addEventListener("open", () => {
            this.retryDelay = this.reconnectDelay;

            for (const message of this.pending) {
                this.socket.send(message);
            }
            this.pending = [];

            for (const handler of this.openHandlers) {
                handler();
            }
        });

        this.socket.addEventListener("message", (event) => {
            this.handleMessage(event.data);
        });

        this.socket.addEventListener("close", () => {
            if (!this.reconnect) {
                return;
            }

            this.reconnectTimer = setTimeout(() => this.openSocket(), this.retryDelay);
            this.retryDelay = Math.min(this.retryDelay * 2, this.maxReconnectDelay);
        });
    }

    send(type, data = null) {
        this.sendMessage({ type, data });
    }

    request(type, data = null) {
        const requestId = this.nextRequestId++;

        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.pendingRequests.delete(requestId);
                reject(new Error(`Request "${type}" timed out`));
            }, this.requestTimeout);

            this.pendingRequests.set(requestId, { resolve, reject, timer });
            this.sendMessage({ type, data, requestId });
        });
    }

    sendMessage(message) {
        const encoded = JSON.stringify(message);

        if (this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(encoded);
            return;
        }

        this.pending.push(encoded);
    }

    on(type, handler) {
        const handlers = this.typeHandlers.get(type) ?? [];
        handlers.push(handler);
        this.typeHandlers.set(type, handlers);
    }

    onOpen(handler) {
        this.openHandlers.push(handler);
    }

    handleMessage(raw) {
        let message;

        try {
            message = JSON.parse(raw);
        } catch {
            console.warn("Ignoring message that is not valid JSON: ", raw);
            return;
        }

        const request = this.pendingRequests.get(message.requestId);

        if (request) {
            this.pendingRequests.delete(message.requestId);
            clearTimeout(request.timer);

            if (message.error) {
                request.reject(new Error(message.error));
            } else {
                request.resolve(message.data);
            }
            return;
        }

        for (const handler of this.typeHandlers.get(message.type) ?? []) {
            handler(message.data);
        }
    }
}

export default GameClient;
