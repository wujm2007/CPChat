const cryptoUtil = require("./cryptoUtil.js");

const SERVER_KEY = cryptoUtil.importKey(`-----BEGIN PUBLIC KEY-----
MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAIkL4Lx9lEjL09SblZrsXF+41r0ncaX3
mrVSIqUXrNoK7k38md/9vl2W5nAeGe5d6c4WlALxjH8KzBqa90o4WUUCAwEAAQ==
-----END PUBLIC KEY-----`);

let __socket, __serverKey, __privateKey, __randomBytes, __randomN, __sessionKey;

const broadcast = "Broadcast";

function send(socket, type, data, encryptType) {
    if (socket)
        socket.emit(type, wrapData(data, encryptType));
}

function wrapData(data, encryptType) {
    const wrappedData = {payload: JSON.stringify(data)};
    if (encryptType)
        switch (encryptType) {
            case "symmetric":
                wrappedData.encrypted = true;
                wrappedData.payload = cryptoUtil.AES256Cipher(wrappedData.payload, __sessionKey);
                break;
            default:
                console.error("unsupported encryptType", encryptType);
        }
    return wrappedData;
}

module.exports = {
    broadcast: broadcast,
    msgHandler: {
        "connect": function (socket) {
            __socket = socket;
            __serverKey = SERVER_KEY;
            __privateKey = cryptoUtil.generateRSAKeyPair();
            __randomBytes = cryptoUtil.randomBytes();
            __randomN = Math.round(Math.random() * 1000);
            console.log("connected to server: " + __socket.id);
        },

        "server-hello": function (data) {
            const payload = JSON.parse(__privateKey.decrypt(data.payload, "utf8"));
            const hash = __serverKey.decryptPublic(data.signature, "utf8");
            if (cryptoUtil.hashcode(data.payload) === hash && __randomN - 1 === payload.n)
                __sessionKey = cryptoUtil.generateSessionKey(__randomBytes, Buffer.from(payload.bytes));
            else
                console.log("invalid server hello");
        },

        "handle": function (data) {
            if (data.payload) {
                if (data.encrypted)
                    return JSON.parse(cryptoUtil.AES256Decipher(data.payload, __sessionKey));
                return JSON.parse(data.payload);
            }
            else return data;
        }
    },

    msgRequester: {
        "client-hello": function () {
            const payload = __serverKey.encrypt({
                key: __privateKey.exportKey("public"),
                bytes: __randomBytes,
                n: __randomN
            }, "base64");
            const signature = __privateKey.encryptPrivate(cryptoUtil.hashcode(payload), "base64");
            __socket.emit("client-hello", {payload: payload, signature: signature});
        },

        "text-message": function (text, recipient) {
            const words = text.split(" ");
            const command = words[0].toLowerCase();
            switch (command) {
                case "\\join":
                    words.shift();
                    const room = words.join("");
                    send(__socket, "room-attempt", room, "symmetric");
                    break;
                case "\\nick":
                    words.shift();
                    const name = words.join("");
                    send(__socket, "name-attempt", name, "symmetric");
                    break;
                default:
                    const message = words.join(" ");
                    if (recipient === broadcast) {
                        send(__socket, "chat", {
                            type: "text",
                            text: message
                        });
                    } else {
                        send(__socket, "whisper", {
                            type: "text",
                            recipient: recipient,
                            text: message
                        }, "symmetric");
                    }
            }
        },

        "file-message": function (data, fileName, recipient) {
            if (recipient === broadcast) {
                send(__socket, "chat", {
                    type: "file",
                    fileName: fileName,
                    data: data
                });
            }
            else {
                send(__socket, "whisper", {
                    type: "file",
                    recipient: recipient,
                    fileName: fileName,
                    data: data
                }, "symmetric");
            }
        }
    }
};