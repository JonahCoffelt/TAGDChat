import GameClient from "/gameClient.js";
import { bindMessages } from "/messages.js";

const qr = document.getElementById("qr");

bindMessages(new GameClient(), document.getElementById("messages"));

function loadQr() {
    qr.src = `/qr.png?${Date.now()}`;
}

qr.addEventListener("error", () => {
    setTimeout(loadQr, 500);
});

loadQr();
