import { nameColor } from "/nameColor.js";

export function bindMessages(gameClient, log) {
    let lastId = 0;

    function addMessage(message) {
        if (!message || message.id <= lastId) {
            return;
        }

        lastId = message.id;

        const row = document.createElement("div");
        row.className = "message";

        const name = document.createElement("span");
        name.className = "name";
        name.textContent = message.name;
        name.style.color = nameColor(message.name);

        const body = document.createElement("span");
        body.className = "body";
        body.textContent = `: ${message.text}`;

        row.append(name, body);
        log.appendChild(row);
        log.scrollTop = log.scrollHeight;
    }

    async function loadMessages() {
        const recent = await gameClient.request("messages", { since: lastId });
        for (const message of recent) {
            addMessage(message);
        }
    }

    gameClient.on("chat", addMessage);
    gameClient.onOpen(loadMessages);
    loadMessages();
}
