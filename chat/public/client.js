import GameClient from "/gameClient.js";
import { bindMessages } from "/messages.js";

const gameClient = new GameClient();
bindMessages(gameClient, document.getElementById("messages"));

const nameComposer = document.getElementById("name-composer");
const nameForm = document.getElementById("name-form");
const nameInput = document.getElementById("name-input");
const chatComposer = document.getElementById("chat-composer");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");

let displayName = "";

nameForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const name = nameInput.value.trim();
    if (!name) {
        return;
    }

    displayName = name.slice(0, 32);
    gameClient.send("name", { name: displayName });

    nameComposer.hidden = true;
    chatComposer.hidden = false;
    chatInput.focus();
});

chatForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const text = chatInput.value.trim();
    if (!text) {
        return;
    }

    gameClient.send("chat", { text });
    chatInput.value = "";
    chatInput.focus();
});

gameClient.onOpen(() => {
    if (displayName) {
        gameClient.send("name", { name: displayName });
    }
});

nameInput.focus();
