import path from "node:path";
import GameServer from "../src/gameServer.js";
import { containsSlur } from "./filter.js";

const MAX_MESSAGES = 50;

const publicDir = path.join(import.meta.dirname, "public");

const gameServer = new GameServer({
    port: 3000,
    publicDir,
    qr: path.join(publicDir, "qr.png"),
});

const messages = [];
let nextId = 1;

gameServer.onConnection((client) => {
    client.displayName = "";
    console.log(`Player ${client.id} joined from ${client.ip}`);
});

gameServer.onDisconnect((client) => {
    console.log(`Player ${client.id} left`);
});

gameServer.on("name", (data, client) => {
    const name = typeof data?.name === "string" ? data.name.trim() : "";
    if (!name || containsSlur(name)) {
        return;
    }

    client.displayName = name.slice(0, 32);
});

gameServer.on("chat", (data, client) => {
    const text = typeof data?.text === "string" ? data.text.trim() : "";
    if (!text || !client.displayName || containsSlur(text)) {
        return;
    }

    const message = {
        id: nextId++,
        name: client.displayName,
        text: text.slice(0, 500),
    };

    messages.push(message);
    if (messages.length > MAX_MESSAGES) {
        messages.shift();
    }

    gameServer.broadcast("chat", message);
});

gameServer.respond("messages", (data) => {
    const since = Number(data?.since) || 0;
    return messages.filter((message) => message.id > since);
});

const url = await gameServer.start();
console.log(`Share this with players: ${url}`);
