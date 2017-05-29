const SERVER_ADDR = "http://localhost:8088";

const $ = require("jquery");
const cryptoUtil = require("./cryptoUtil.js");
const io = require("socket.io-client");
const msgHandler = require("./clientUtil");

const SERVER_KEY = cryptoUtil.importKey(`-----BEGIN PUBLIC KEY-----
MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAIkL4Lx9lEjL09SblZrsXF+41r0ncaX3
mrVSIqUXrNoK7k38md/9vl2W5nAeGe5d6c4WlALxjH8KzBqa90o4WUUCAwEAAQ==
-----END PUBLIC KEY-----`);

const broadcast = "Broadcast";

$(function () {

    const socket = io(SERVER_ADDR);

    const key = cryptoUtil.generateRSAKeyPair();

    let __sessionKey = null;

    function sessionKey(key) {
        if (key)
            __sessionKey = key;
        return __sessionKey;
    }

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

    function createMessage(name, text) {
        const li = $("<li>");
        // li.append($("<p>").addClass("time").append($("<span>").text("10:45")));
        const div = $("<div>");
        if (name === nickName())
            div.addClass("main self");
        else
            div.addClass("main");
        div.append($("<img>").addClass("avatar").attr('src', getAvatar(name))).append($("<div>").addClass("text").html(text));
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
        msgHandler.handler["connect"](socket, SERVER_KEY, key);
        msgHandler.requester["client-hello"]();
    });

    socket.on("server-hello", function (data) {
        const key = msgHandler.handler["server-hello"](data);
        sessionKey(key);
    });

    function display(msg) {
        switch (msg.type) {
            case "file":
                fetch(msg.data).then((res) => res.blob()).then((blob) => {
                    append(createDownload(msg.sender, msg.fileName, blob));
                });
                break;
            case "text":
                append(createMessage(msg.sender, msg.text));
                break;
            default:
                console.error("unsupported message type: " + msg.type);
        }
    }

    socket.on("push-message", function (data) {
        const msg = msgHandler.handler.handle(data);
        display(msg);
    });

    socket.on("whisper-ack", function (data) {
        const msg = msgHandler.handler.handle(data);
        display(msg);
    });

    socket.on("name-result", function (data) {
        const result = msgHandler.handler.handle(data);
        if (result.success) {
            if (result.oldName === nickName() || !result.oldName) {
                nickName(result.newName);
                append(createMsg("Your name is now " + result.newName));
            } else
                append(createMsg(result.oldName + " is now known as " + result.newName));
        }
        else
            append(createMsg("Rename failed, " + result.message));
    });

    socket.on("message", function (data) {
        const msg = msgHandler.handler.handle(data);
        append(createMsg(msg.text));
    });

    socket.on("user-list", function (data) {
        const userList = $("#userList");
        const selected = userList.val();

        const list = msgHandler.handler.handle(data);
        userList.empty().append("<option value=" + broadcast + ">" + broadcast + "</option>");
        list.forEach((m) => userList.append("<option value=" + m + ">" + m + "</option>"));
        if (list.includes(selected))
            userList.val(selected);
        else
            userList.val(broadcast);
    });

    socket.on("join-room", function (data) {
        const result = msgHandler.handler.handle(data);
        if (result.success) {
            $("#dialogue-container").html("");
            $("#room-name").text(result.room);
        } else {
            append(createMsg("Join " + result.room + " failed."));
        }
    });

    $("#btnText").click(function () {
        const selectedUser = $("#userList").val();
        const inputText = $("#chatText");
        if (inputText.val() !== null && inputText.val() !== "") {
            msgHandler.requester["text-message"](inputText.val(), selectedUser);
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
                msgHandler.requester["file-message"](data, fileName, selectedUser);
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

module.exports.broadcast = broadcast;