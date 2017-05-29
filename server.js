const Koa = require("koa");
const app = new Koa();
const io = require("socket.io").listen(8088);
const fs = require("fs");

const CryptoUtil = require("./cryptoUtil");

const KEY = CryptoUtil.importKey(`-----BEGIN RSA PRIVATE KEY-----
MIIBOwIBAAJBAIkL4Lx9lEjL09SblZrsXF+41r0ncaX3mrVSIqUXrNoK7k38md/9
vl2W5nAeGe5d6c4WlALxjH8KzBqa90o4WUUCAwEAAQJAHuAjMLQmLURmpBatXOr1
YMd28cSqMRcYrtMjZQhxc+n/J9OIvBerdbvN7RxG3sGX5/Eca97JQTuGhV3hGtcb
nQIhANoUS9tMW6yNtUW8ub00xkiYx6dQ0Qms/TIn+NVwIyC/AiEAoOBwLykmzVGa
GIb3wWP8Li06dYet4qYjlzFfqpYqQvsCIHXhHLPYjYEzRDYC8p9shHW/Z8RwMd46
DM7svluY9tP/AiEAjwc7dhJmFwDHuaq1NtDH8d3wLXHVXL5Mwiz5WtZq+GUCIQCr
XacabSW3LnrN7kQ4K5WAFTToouTvgZPDmlbc02ejlQ==
-----END RSA PRIVATE KEY-----`);

let numGuest = 0;
let nicknames = new Map();
let namesUsed = new Set();
let currentRoom = {};
let sessionKeys = new Map();

nicknames.getSocketId = function (nickname) {
    for (let [key, value] of nicknames)
        if (value === nickname)
            return key;
};

function getSessionKey(sockedId) {
    return sessionKeys.get(sockedId);
}

app.use(require("koa-static")("public"));

app.use(async (ctx, next) => {
    await next();
    if ("/" === ctx.path) {
        ctx.response.type = "html";
        ctx.response.body = fs.createReadStream("index.html");
    }
});

const server = app.listen(8888, () => {
        const host = server.address().address;
        const port = server.address().port;
        console.log("You can access this site via http://%s:%s", host, port);
    }
);

function assignGuestName(socket) {
    let name = nicknames.get(socket.id);
    if (!name) {
        name = "Guest" + numGuest++;
        nicknames.set(socket.id, name);
        namesUsed.add(name);
    }
    sendToSocket(socket.id, "name-result", {
        success: true,
        newName: name
    });
    return name;
}

function changeName(socket, name) {
    if (name.startsWith("Guest")) {
        sendToSocket(socket.id, "name-result", {
            success: false,
            message: "Names cannot begin with \"Guest\"."
        });
    } else {
        if (!namesUsed.has(name)) {
            let oldName = nicknames.get(socket.id);
            namesUsed.add(name);
            nicknames.set(socket.id, name);
            namesUsed.delete(oldName);
            sendToRoom(currentRoom[socket.id], "name-result", {
                success: true,
                oldName: oldName,
                newName: name
            });
            sendUserList();
        } else {
            sendToSocket(socket.id, "name-result", {
                success: false,
                message: "That name is already in use."
            });
        }
    }
}

function joinRoom(socket, room) {
    socket.leave(currentRoom[socket.id]);
    socket.join(room);
    currentRoom[socket.id] = room;

    sendToSocket(socket.id, "join-room", {
        success: true,
        room: currentRoom[socket.id]
    });

    sendToRoom(currentRoom[socket.id], "message", {
        text: currentRoom[socket.id] + " : Welcome " + nicknames.get(socket.id) + "."
    });
}

function sendToRoom(room, type, data) {
    io.sockets.in(room).emit(type, {payload: JSON.stringify(data)});
}

function sendUserList() {
    io.sockets.emit("user-list", Array.from(nicknames.values()));
}

function wrapData(data, key) {
    const wrappedData = {payload: JSON.stringify(data)};
    if (key) {
        wrappedData.encrypted = true;
        wrappedData.payload = CryptoUtil.AES256Cipher(wrappedData.payload, key);
    }
    return wrappedData;
}

function sendToSocket(socketId, type, data) {
    if (socketId)
        io.to(socketId).emit(type, wrapData(data, getSessionKey(socketId)));
}

function handle(data, socketId) {
    if (data.payload) {
        if (data.encrypted)
            return JSON.parse(CryptoUtil.AES256Decipher(data.payload, getSessionKey(socketId)));
        return JSON.parse(data.payload);
    }
    else return data;
}

io.on("connection", function (socket) {

    console.log("user connect: " + socket.id);

    let name = assignGuestName(socket);
    joinRoom(socket, "Lobby");
    sendUserList();

    socket.on("client-hello", function (data) {
        const payload = JSON.parse(KEY.decrypt(data.payload, "utf8"));
        const clientKey = CryptoUtil.importKey(payload.key);
        const hash = clientKey.decryptPublic(data.signature, "utf8");
        const randomBytes = CryptoUtil.randomBytes();

        if (CryptoUtil.hashcode(data.payload) === hash) {
            const sessionKey = CryptoUtil.generateSessionKey(Buffer.from(payload.bytes), randomBytes);
            sessionKeys.set(socket.id, sessionKey);

            const newData = clientKey.encrypt({
                bytes: randomBytes,
                n: payload.n - 1
            }, "base64");

            const newSignature = KEY.encryptPrivate(CryptoUtil.hashcode(newData), "base64");

            socket.emit("server-hello", {
                    payload: newData,
                    signature: newSignature
                }
            );
            return;
        }
        console.log("invalid client hello");
    });
    socket.on("chat", function (message) {
        const payload = handle(message, socket.id);
        payload.sender = nicknames.get(socket.id);
        sendToRoom(currentRoom[socket.id], "push-message", payload);
    });
    socket.on("whisper", function (message) {
        const payload = handle(message, socket.id);
        const recipientId = nicknames.getSocketId(payload.recipient);
        payload.sender = nicknames.get(socket.id);
        if (recipientId !== socket.id)
            sendToSocket(recipientId, "push-message", payload);
        sendToSocket(socket.id, "whisper-ack", payload);
    });
    socket.on("name-attempt", function (name) {
        changeName(socket, handle(name, socket.id));
    });
    socket.on("room-attempt", function (room) {
        joinRoom(socket, handle(room, socket.id));
    });
    socket.on("disconnect", function () {
        sendToRoom(currentRoom[socket.id], "message", {
            text: currentRoom[socket.id] + " : Bye " + nicknames.get(socket.id) + "."
        });
        nicknames.delete(socket.id);
        sendUserList();
    });
});