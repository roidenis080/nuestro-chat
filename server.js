const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Servir los archivos de la carpeta public
app.use(express.static(path.join(__dirname, "public")));

// ==========================================
// ALMACENAMIENTO DE CHATS
// ==========================================

const chats = new Map();

const DATA_FILE = path.join(__dirname, "chats.json");

// Cargar chats guardados
function loadChats() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, "{}");
      console.log("No existía chats.json. Se creó uno nuevo.");
      return;
    }

    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));

    for (const [code, chat] of Object.entries(data)) {
      chats.set(code, {
        users: new Map(),
        messages: Array.isArray(chat.messages) ? chat.messages : []
      });
    }

    console.log(`Cargadas ${chats.size} salas.`);
  } catch (error) {
    console.error("Error cargando chats:", error);
  }
}

// Guardar chats
function saveChats() {
  try {
    const data = {};

    for (const [code, chat] of chats.entries()) {
      data[code] = {
        messages: chat.messages
      };
    }

    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(data, null, 2),
      "utf8"
    );

    console.log("Chats guardados.");
  } catch (error) {
    console.error("Error guardando chats:", error);
  }
}

// Cargar datos al iniciar el servidor
loadChats();

// ==========================================
// CREAR CÓDIGOS DE SALA
// ==========================================

function makeCode() {
  let code;

  do {
    code = Math.random()
      .toString(36)
      .slice(2, 8)
      .toUpperCase();
  } while (chats.has(code));

  return code;
}

// ==========================================
// SOCKET.IO
// ==========================================

io.on("connection", (socket) => {

  console.log(`Usuario conectado: ${socket.id}`);

  // ========================================
  // CREAR CHAT
  // ========================================

  socket.on("create-chat", ({ name }) => {

    const code = makeCode();

    chats.set(code, {
      users: new Map(),
      messages: []
    });

    // Guardar inmediatamente la nueva sala
    saveChats();

    joinChat(socket, code, name);

    socket.emit("chat-created", code);

    console.log(`Chat creado: ${code}`);
  });

  // ========================================
  // UNIRSE A CHAT
  // ========================================

  socket.on("join-chat", ({ code, name }) => {

    code = String(code || "")
      .trim()
      .toUpperCase();

    if (!chats.has(code)) {
      return socket.emit(
        "chat-error",
        "Ese código no existe."
      );
    }

    const chat = chats.get(code);

    // Máximo 2 personas
    if (
      chat.users.size >= 2 &&
      !chat.users.has(socket.id)
    ) {
      return socket.emit(
        "chat-error",
        "Este chat ya tiene dos personas."
      );
    }

    joinChat(socket, code, name);

    console.log(
      `Usuario ${socket.id} entró al chat ${code}`
    );
  });

  // ========================================
  // ENVIAR MENSAJE
  // ========================================

  socket.on("send-message", (text) => {

    const code = socket.data.chatCode;

    if (!code || !chats.has(code)) {
      return;
    }

    const chat = chats.get(code);
    const user = chat.users.get(socket.id);

    text = String(text || "").trim();

    if (!text || !user) {
      return;
    }

    const message = {
      id:
        Date.now() +
        "-" +
        Math.random()
          .toString(16)
          .slice(2),

      name: user.name,

      text,

      time: new Date().toISOString()
    };

    // Añadir mensaje
    chat.messages.push(message);

    // Máximo 200 mensajes
    if (chat.messages.length > 200) {
      chat.messages.shift();
    }

    // Guardar DESPUÉS de limitar los mensajes
    saveChats();

    // Enviar mensaje a todos los usuarios del chat
    io.to(code).emit(
      "new-message",
      message
    );

    console.log(
      `Mensaje enviado en ${code} por ${user.name}`
    );
  });

  // ========================================
  // ESCRIBIENDO...
  // ========================================

  socket.on("typing", () => {

    if (socket.data.chatCode) {

      socket
        .to(socket.data.chatCode)
        .emit("typing", true);
    }
  });

  // ========================================
  // DEJÓ DE ESCRIBIR
  // ========================================

  socket.on("stop-typing", () => {

    if (socket.data.chatCode) {

      socket
        .to(socket.data.chatCode)
        .emit("typing", false);
    }
  });

  // ========================================
  // DESCONECTAR
  // ========================================

  socket.on("disconnect", () => {

    const code = socket.data.chatCode;

    if (!code || !chats.has(code)) {
      return;
    }

    const chat = chats.get(code);

    chat.users.delete(socket.id);

    // Actualizar cantidad de personas conectadas
    io.to(code).emit(
      "presence",
      {
        count: chat.users.size
      }
    );

    console.log(
      `Usuario ${socket.id} salió del chat ${code}`
    );

    // IMPORTANTE:
    // NO eliminamos la sala.
    // Los mensajes permanecen guardados.
  });
});

// ==========================================
// UNIR USUARIO A UNA SALA
// ==========================================

function joinChat(socket, code, name) {

  const chat = chats.get(code);

  if (!chat) {
    return;
  }

  // Limitar nombre a 30 caracteres
  name = String(name || "Invitado")
    .trim()
    .slice(0, 30);

  if (!name) {
    name = "Invitado";
  }

  // Unirse a Socket.IO
  socket.join(code);

  // Guardar información del usuario conectado
  socket.data.chatCode = code;

  chat.users.set(socket.id, {
    name
  });

  // Enviar al usuario el historial
  socket.emit(
    "chat-joined",
    {
      code,

      messages: chat.messages,

      count: chat.users.size
    }
  );

  // Avisar a todos cuántas personas hay
  io.to(code).emit(
    "presence",
    {
      count: chat.users.size
    }
  );
}

// ==========================================
// SERVIDOR
// ==========================================

const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {

  console.log(
    `Nuestro Chat funcionando en el puerto ${PORT}`
  );

  console.log(
    `Puerto: ${PORT}`
  );
});