const SERVER_ADDR = "http://192.168.31.44:8088";

const $ = require("jquery");
const cryptoUtil = require("./CryptoUtil.js");
const io = require("socket.io-client");

const SERVER_KEY = cryptoUtil.importKey(`-----BEGIN PUBLIC KEY-----
MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAIkL4Lx9lEjL09SblZrsXF+41r0ncaX3
mrVSIqUXrNoK7k38md/9vl2W5nAeGe5d6c4WlALxjH8KzBqa90o4WUUCAwEAAQ==
-----END PUBLIC KEY-----`);

$(function () {
    let sessionKey = null;

    const socket = io(SERVER_ADDR);

    const broadcast = "Broadcast";

    const key = cryptoUtil.generateRSAKeyPair();
    const randomBytes = cryptoUtil.randomBytes();
    const randomN = Math.round(Math.random() * 1000);

    let getSessionKey = function () {
        return sessionKey;
    };

    function append(element) {
        $("#dialogue-container").append($("<li>").append(element));
    }

    function createDownload(fileName, blob) {
        return $("<a>").text(fileName).attr("href", URL.createObjectURL(blob)).attr("download", fileName);
    }

    let nickName = "Default User";

    socket.on("connect", function () {
        console.log("connected to server: " + socket.id);

        const data = SERVER_KEY.encrypt({
            key: key.exportKey("public"),
            bytes: randomBytes,
            n: randomN
        }, "base64");
        const signature = key.encryptPrivate(cryptoUtil.hashcode(data), "base64");

        socket.emit("client hello", {
                data: data,
                signature: signature
            }
        );
    });

    socket.on("server hello", function (msg) {
        const data = JSON.parse(key.decrypt(msg.data, "utf8"));
        const hash = SERVER_KEY.decryptPublic(msg.signature, "utf8");
        if (cryptoUtil.hashcode(msg.data) === hash) {
            if (randomN - 1 === data.n) {
                sessionKey = cryptoUtil.generateSessionKey(randomBytes, Buffer.from(data.bytes));
                return;
            }
        }
        console.log("invalid server hello");
    });

    socket.on("push message", function (msg) {
        if (msg.encrypted)
            msg.text = cryptoUtil.AES256Decipher(msg.text, getSessionKey());
        append($("<span>").text(msg.sender + ": " + msg.text + " (" + msg.time + ")"));
    });

    socket.on("push base64", function (file) {
        if (file.encrypted)
            file.data = cryptoUtil.AES256Decipher(file.data, getSessionKey());
        fetch(file.data).then((res) => res.blob()).then((blob) => {
            append(createDownload(file.name, blob));
        });
    });

    socket.on("name result", function (msg) {
        if (msg.success)
            nickName = msg.name;
        else
            append($("<span>").text("Rename failed, " + msg.message));
    });

    socket.on("message", function (msg) {
        append($("<span>").text(msg.text));
    });

    socket.on("user list", function (msg) {
        const userList = $("#userList");
        const selected = userList.val();
        userList.empty().append("<option value=" + broadcast + ">" + broadcast + "</option>");
        msg.forEach((m) => userList.append("<option value=" + m + ">" + m + "</option>"));
        if (selected)
            userList.val(selected);
    });

    socket.on("cls", function () {
        $("#dialogue-container").html("");
    });

    $("#btnText").click(function () {
        const selectedUser = $("#userList").val();
        const inputText = $("input[name=chatText]");
        if (inputText.val() !== null && inputText.val() !== "") {
            let words = inputText.val().split("");
            let command = words[0].toLowerCase();
            switch (command) {
                case "\\join":
                    words.shift();
                    let room = words.join("");
                    socket.emit("room attempt", room);
                    break;
                case "\\nick":
                    words.shift();
                    let name = words.join("");
                    socket.emit("name attempt", name);
                    break;
                default:
                    let message = words.join("");
                    if (selectedUser === broadcast) {
                        socket.emit("chat", {
                            sender: nickName,
                            text: message,
                            time: new Date().toLocaleString()
                        });
                    } else {
                        socket.emit("whisper", {
                            encrypted: true,
                            recipient: selectedUser,
                            sender: nickName,
                            text: cryptoUtil.AES256Cipher(message, getSessionKey()),
                            time: new Date().toLocaleString()
                        });
                    }
            }
            inputText.val("");
        }
    });

    $("#post").change(function () {
        const selectedUser = $("#userList").val();
        let files = $("#post")[0].files;
        if (files.length !== 0) {
            let reader = new FileReader();
            reader.onload = function (evt) {
                let file = evt.target.result;
                if (selectedUser === broadcast) {
                    socket.emit("base64 chat", {
                            sender: nickName,
                            name: files[0].name,
                            data: file,
                            time: new Date().toLocaleString()
                        }
                    );
                }
                else {
                    socket.emit("base64 whisper", {
                            encrypted: true,
                            sender: nickName,
                            recipient: selectedUser,
                            name: files[0].name,
                            data: cryptoUtil.AES256Cipher(file, getSessionKey()),
                            time: new Date().toLocaleString()
                        }
                    );
                }
            };
            reader.readAsDataURL(files[0]);
        }
    });

    $("#chatText").keypress(function (e) {
        if (e.ctrlKey && e.which === 13)
            $("#btnText").click();
    });
});