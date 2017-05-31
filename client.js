const SERVER_ADDR = "http://localhost:8088";

const $ = require("jquery");
const cryptoUtil = require("./cryptoUtil.js");
const io = require("socket.io-client");
const msgHandler = require("./clientUtil");
const Vue = require("vue/dist/vue.js");

const SERVER_KEY = cryptoUtil.importKey(`-----BEGIN PUBLIC KEY-----
MFwwDQYJKoZIhvcNAQEBBQADSwAwSAJBAIkL4Lx9lEjL09SblZrsXF+41r0ncaX3
mrVSIqUXrNoK7k38md/9vl2W5nAeGe5d6c4WlALxjH8KzBqa90o4WUUCAwEAAQ==
-----END PUBLIC KEY-----`);

const broadcast = "Broadcast";

$(function () {

    function nickName(newName) {
        if (newName)
            appChat.nickName = newName;
        return appChat.nickName;
    }

    const messages = new Map();

    messages.add = function (sender, recipient, text) {
        const key = sender === nickName() ? recipient : recipient === broadcast ? broadcast : sender;
        if (!messages.has(key)) {
            messages.set(key, []);
            appChat.update();
        }
        messages.get(key).push({sender: sender, recipient: recipient, text: text});
        if (sender === nickName())
            appChat.select(recipient);
    };

    let appChat = new Vue({
        el: '#chat',
        data: {
            nickName: null,
            messages: null,
            users: null,
            selectedUser: null,
            userList: null,
        },
        methods: {
            select: function (user) {
                this.selectedUser = user;
                this.messages = messages.get(this.selectedUser);

                // deal with asynchronous update
                this.$nextTick(function () {
                    const container = $("#dialogue-container").parent();
                    container.scrollTop(container[0].scrollHeight);
                });

                $("#userList").val(this.selectedUser);
                return this.selectedUser;
            },
            update: function () {
                this.users = Array.from(messages.keys());
            }
        }
    });

    const socket = io(SERVER_ADDR);

    const key = cryptoUtil.generateRSAKeyPair();

    function createDownload(fileName, blob) {
        const a = $("<a>").text(fileName).attr("href", URL.createObjectURL(blob)).attr("download", fileName);
        return a.prop("outerHTML");
    }

    socket.on("connect", function () {
        msgHandler.handler["connect"](socket, SERVER_KEY, key);
        msgHandler.requester["client-hello"]();
    });

    socket.on("server-hello", function (data) {
        msgHandler.handler["server-hello"](data);
    });

    function display(msg) {
        switch (msg.type) {
            case "file":
                fetch(msg.data).then((res) => res.blob()).then((blob) => {
                    messages.add(msg.sender, msg.recipient, createDownload(msg.fileName, blob));
                });
                break;
            case "text":
                messages.add(msg.sender, msg.recipient, msg.text);
                break;
            case "system":
                messages.add(broadcast, nickName(), "System: " + msg.text);
                break;
            default:
                console.error("unsupported message type: " + msg.type);
        }
    }

    function notify(msg) {
        if (msg.sender !== nickName() && msg.recipient !== broadcast) {
            let text;

            switch (msg.type) {
                case "file":
                    text = msg.fileName;
                    break;
                case "text":
                    text = msg.text;
                    break;
                default:
                    console.error("unsupported message type: " + msg.type);
                    return;
            }

            let newNotification = new Notification(msg.sender, {
                body: text
            })
        }
    }

    socket.on("push-message", function (data) {
        const msg = msgHandler.handler.handle(data);
        display(msg);
        notify(msg);
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
                display({type: "system", text: "Your name is now " + result.newName});
            } else {
                display({type: "system", text: result.oldName + " is now known as " + result.newName});
            }
            if (messages.has(result.oldName)) {
                const list = messages.get(result.oldName);
                messages.delete(result.oldName);
                messages.set(result.newName, list);
                appChat.update();
            }
        }
        else
            display({type: "system", text: "Rename failed, " + result.message});
    });

    socket.on("message", function (data) {
        const msg = msgHandler.handler.handle(data);
        display({type: "system", text: msg.text});
    });

    socket.on("user-list", function (data) {
        const list = msgHandler.handler.handle(data);
        appChat.userList = [broadcast].concat(list);
        appChat.users.forEach(function (u) {
            if (!list.includes(u) && u !== broadcast)
                messages.delete(u);
        });
        appChat.update();
    });

    socket.on("join-room", function (data) {
        const result = msgHandler.handler.handle(data);
        if (result.success) {
            // $("#dialogue-container").html("");
            $("#room-name").text(result.room);
        } else {
            display({type: "system", text: "Join " + result.room + " failed."});
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