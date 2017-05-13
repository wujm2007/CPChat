const Koa = require('koa');
const app = new Koa();
const io = require('socket.io').listen(8088);
const fs = require('fs');

const CryptoUtil = require("./CryptoUtil");

let numGuest = 0;
let nicknames = new Map();
let namesUsed = new Set();
let currentRoom = {};

nicknames.getSocketId = function (nickname) {
    for (let [key, value] of nicknames)
        if (value === nickname)
            return key;
};

function getSessionKey(sockedId) {
    return sockedId;
}

app.use(require('koa-static')('public'));

app.use(async (ctx, next) => {
    await next();
    if ('/' === ctx.path) {
        ctx.response.type = 'html';
        ctx.response.body = fs.createReadStream('index.html');
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
    socket.emit("name result", {
        success: true,
        name: name
    });
    return name;
}

function changeName(socket, name) {
    if (name.startsWith("Guest")) {
        socket.emit('name result', {
            success: false,
            message: 'Names cannot begin with "Guest".'
        });
    } else {
        if (!namesUsed.has(name)) {
            let previousName = nicknames.get(socket.id);
            namesUsed.add(name);
            nicknames.set(socket.id, name);
            namesUsed.delete(previousName);
            socket.emit('name result', {
                success: true,
                name: name
            });
            sendToRoom(currentRoom[socket.id], 'message', {
                text: previousName + ' is now known as ' + name + '.'
            });
        } else {
            socket.emit('name result', {
                success: false,
                message: 'That name is already in use.'
            });
        }
    }
}

function joinRoom(socket, room) {
    socket.leave(currentRoom[socket.id]);
    socket.join(room);
    currentRoom[socket.id] = room;
    socket.emit("cls");

    sendToRoom(currentRoom[socket.id], 'message', {
        text: currentRoom[socket.id] + " : Welcome " + nicknames.get(socket.id) + "."
    });
}

function sendToRoom(room, type, msg) {
    io.sockets.in(room).emit(type, msg);
}

function sendUserList() {
    io.sockets.emit('user list', Array.from(nicknames.values()));
}

function sendToSocket(socketId, type, msg) {
    if (socketId) {
        msg.encrypted = true;
        if (msg.text)
            msg.text = CryptoUtil.AES256Cipher(msg.text, getSessionKey(socketId));
        if (msg.data)
            msg.data = CryptoUtil.AES256Cipher(msg.data, getSessionKey(socketId));
        io.to(socketId).emit(type, msg);
    }
}

io.on('connection', function (socket) {
    let name = assignGuestName(socket);
    sendUserList();
    joinRoom(socket, "Lobby");
    socket.on('chat', function (message) {
        sendToRoom(currentRoom[socket.id], 'push message', message);
    });
    socket.on('whisper', function (message) {
        const sessionKey = getSessionKey(socket.id);
        if (message.encrypted)
            message.text = CryptoUtil.AES256Decipher(message.text, sessionKey);
        let recipientId = nicknames.getSocketId(message.recipient);
        sendToSocket(recipientId, 'push message', message)
    });
    socket.on('base64 chat', function (file) {
        sendToRoom(currentRoom[socket.id], 'push base64', file);
    });
    socket.on('base64 whisper', function (file) {
        const sessionKey = getSessionKey(socket.id);
        if (file.encrypted)
            file.data = CryptoUtil.AES256Decipher(file.data, sessionKey);
        let recipientId = nicknames.getSocketId(file.recipient);
        sendToSocket(recipientId, 'push base64', file);
    });
    socket.on('name attempt', function (name) {
        changeName(socket, name);
    });
    socket.on('room attempt', function (room) {
        joinRoom(socket, room);
    });
    socket.on('disconnect', function () {
        sendToRoom(currentRoom[socket.id], 'message', {
            text: currentRoom[socket.id] + " : Bye " + nicknames.get(socket.id) + "."
        });
        nicknames.delete(socket.id);
        sendUserList();
    });
});