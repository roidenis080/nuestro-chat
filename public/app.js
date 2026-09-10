const socket = io();

const welcome = document.querySelector("#welcome");
const chat = document.querySelector("#chat");
const nameInput = document.querySelector("#name");
const codeInput = document.querySelector("#code");
const error = document.querySelector("#error");
const messages = document.querySelector("#messages");
const status = document.querySelector("#status");
const typing = document.querySelector("#typing");
const messageInput = document.querySelector("#message");
const codeBox = document.querySelector("#codeBox");
const chatCode = document.querySelector("#chatCode");

let myName = "";

function showError(text) { error.textContent = text; }

function enter() {
  welcome.classList.add("hidden");
  chat.classList.remove("hidden");
  messageInput.focus();
}

function renderMessage(m) {
  const div = document.createElement("div");
  div.className = "msg " + (m.name === myName ? "me" : "other");

  const name = document.createElement("div");
  name.className = "name";
  name.textContent = m.name;

  const text = document.createElement("div");
  text.textContent = m.text;

  const time = document.createElement("div");
  time.className = "time";
  time.textContent = new Date(m.time).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});

  div.append(name, text, time);
  messages.appendChild(div);
  messages.scrollTop = messages.scrollHeight;
}

function updatePresence(count) {
  status.textContent = count >= 2 ? "🟢 Los dos están conectados" : "🟡 Esperando a la otra persona...";
}

document.querySelector("#create").onclick = () => {
  myName = nameInput.value.trim();
  if (!myName) return showError("Escribe tu nombre primero.");
  showError("");
  socket.emit("create-chat", {name: myName});
};

document.querySelector("#join").onclick = () => {
  myName = nameInput.value.trim();
  const code = codeInput.value.trim().toUpperCase();
  if (!myName) return showError("Escribe tu nombre primero.");
  if (code.length < 4) return showError("Escribe el código del chat.");
  showError("");
  socket.emit("join-chat", {code, name: myName});
};

socket.on("chat-created", (code) => {
  codeBox.classList.remove("hidden");
  chatCode.textContent = code;
});

socket.on("chat-joined", ({code, messages: oldMessages, count}) => {
  chatCode.textContent = code;
  if (count < 2) codeBox.classList.remove("hidden");
  oldMessages.forEach(renderMessage);
  updatePresence(count);
  enter();
});

socket.on("chat-error", showError);
socket.on("new-message", renderMessage);
socket.on("presence", ({count}) => {
  updatePresence(count);
  if (count >= 2) codeBox.classList.add("hidden");
});

document.querySelector("#form").onsubmit = (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text) return;
  socket.emit("send-message", text);
  messageInput.value = "";
  socket.emit("stop-typing");
};

let typingTimer;
messageInput.addEventListener("input", () => {
  socket.emit("typing");
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => socket.emit("stop-typing"), 700);
});

socket.on("typing", (isTyping) => {
  typing.textContent = isTyping ? "Está escribiendo..." : "";
});

document.querySelector("#copy").onclick = async () => {
  if (!chatCode.textContent) return;
  await navigator.clipboard.writeText(chatCode.textContent);
  status.textContent = "❤️ Código copiado";
  setTimeout(() => status.textContent = "🟢 Los dos están conectados", 1500);
};