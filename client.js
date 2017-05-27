const SERVER_ADDR = "http://45.78.16.129:8088";

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
        const container = $("#dialogue-container");
        container.append(element);
        const containerDiv = container.parent();
        containerDiv.scrollTop(containerDiv[0].scrollHeight);
    }

    function getAvatar(user) {
        if (user === nickName())
            return "images/avatar1.jpeg";
        else
            return "images/avatar2.jpeg";
    }

    function createMessage(user, text) {
        const li = $("<li>");
        // li.append($("<p>").addClass("time").append($("<span>").text("10:45")));
        const div = $("<div>");
        if (user === nickName())
            div.addClass("main self");
        else
            div.addClass("main");
        div.append($("<img>").addClass("avatar").attr('src', getAvatar(user))).append($("<div>").addClass("text").html(text));
        li.append(div);
        return li;
    }

    function createMsg(text) {
        const li = $("<li>");
        li.addClass("alert").append($("<span>").text(text));
        return li;
    }

    function createDownload(sender, fileName, blob) {
        return createMessage(sender, $("<a>").text(fileName).attr("href", URL.createObjectURL(blob)).attr("download", fileName));
    }

    let __nickName = "Default User";

    function nickName(newName) {
        if (newName)
            __nickName = newName;
        return __nickName;
    }

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
        append(createMessage(msg.sender, msg.text));
    });

    socket.on("push base64", function (file) {
        if (file.encrypted)
            file.data = cryptoUtil.AES256Decipher(file.data, getSessionKey());
        fetch(file.data).then((res) => res.blob()).then((blob) => {
            append(createDownload(file.sender, file.name, blob));
        });
    });

    socket.on("name result", function (data) {
        if (data.success) {
            if (data.oldName === nickName() || !data.oldName) {
                nickName(data.newName);
                append(createMsg("Your name is now " + data.newName));
            } else
                append(createMsg(data.oldName + " is now known as " + data.newName));
        }
        else
            append(createMsg("Rename failed, " + data.message));
    });

    socket.on("message", function (msg) {
        append(createMsg(msg.text));
    });

    socket.on("user list", function (msg) {
        const userList = $("#userList");
        const selected = userList.val();
        userList.empty().append("<option value=" + broadcast + ">" + broadcast + "</option>");
        msg.forEach((m) => userList.append("<option value=" + m + ">" + m + "</option>"));
        if (msg.includes(selected))
            userList.val(selected);
        else
            userList.val(broadcast);
    });

    socket.on("join-room", function (data) {
        if (data.success) {
            $("#dialogue-container").html("");
            $("#room-name").text(data.room);
        } else {
            append(createMsg("Join " + data.room + " failed."));
        }
    });

    $("#btnText").click(function () {
        const selectedUser = $("#userList").val();
        const inputText = $("#chatText");
        if (inputText.val() !== null && inputText.val() !== "") {
            let words = inputText.val().split(" ");
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
                    let message = words.join(" ");
                    if (selectedUser === broadcast) {
                        socket.emit("chat", {
                            sender: nickName(),
                            text: message,
                            time: new Date().toLocaleString()
                        });
                    } else {
                        if (selectedUser !== nickName()) {
                            console.log(selectedUser, nickName(), selectedUser === nickName());
                            socket.emit("whisper", {
                                encrypted: true,
                                recipient: selectedUser,
                                sender: nickName(),
                                text: cryptoUtil.AES256Cipher(message, getSessionKey()),
                                time: new Date().toLocaleString()
                            });
                        }
                        append(createMessage(nickName(), message));
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
                const data = evt.target.result;
                const fileName = files[0].name;
                if (selectedUser === broadcast) {
                    socket.emit("base64 chat", {
                            name: fileName,
                            data: data,
                            time: new Date().toLocaleString()
                        }
                    );
                }
                else {
                    if (selectedUser !== nickName()) {
                        socket.emit("base64 whisper", {
                                encrypted: true,
                                recipient: selectedUser,
                                name: fileName,
                                data: cryptoUtil.AES256Cipher(data, getSessionKey()),
                                time: new Date().toLocaleString()
                            }
                        );
                    }
                    fetch(data).then((res) => res.blob()).then((blob) => {
                        append(createDownload(nickName(), fileName, blob));
                    });
                }
            };
            reader.readAsDataURL(files[0]);
        }
    });

    $("#chatText").keypress(function (e) {
        if (e.which === 13) {
            e.preventDefault();
            if (e.ctrlKey) {
                const inputText = $("#chatText");
                inputText.val(inputText.val() + "\n");
            } else
                $("#btnText").click();
        }
    });
});