const Koa = require('koa');
const app = new Koa();
const io = require('socket.io').listen(8088);
const fs = require('fs');

let numGuest = 0;
let nickNames = {};
let namesUsed = new Set();
let currentRoom = {};

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
    let name = nickNames[socket.id];
    if (!name) {
        name = "Guest" + numGuest++;
        nickNames[socket.id] = name;
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
            let previousName = nickNames[socket.id];
            namesUsed.add(name);
            nickNames[socket.id] = name;
            namesUsed.delete(previousName);
            socket.emit('name result', {
                success: true,
                name: name
            });
            io.sockets.in(currentRoom[socket.id]).emit('message', {
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
    io.sockets.in(currentRoom[socket.id]).emit('message', {
        text: currentRoom[socket.id] + " : Welcome " + nickNames[socket.id] + "."
    });
}

io.on('connection', function (socket) {
    let address = socket.request.connection.remoteAddress;
    let name = assignGuestName(socket);
    joinRoom(socket, "Lobby");
    socket.on('send message', function (message) {
        io.sockets.in(currentRoom[socket.id]).emit('push message', message);
    });
    socket.on('base64 file', function (file) {
        io.sockets.in(currentRoom[socket.id]).emit('push base64 file', file);
    });
    socket.on('name attempt', function (name) {
        changeName(socket, name);
    });
    socket.on('room attempt', function (room) {
        joinRoom(socket, room);
    });
});