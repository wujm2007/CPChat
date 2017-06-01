const SERVER_ADDR = "http://localhost:8088";

const $ = require("jquery");
const Vue = require("vue/dist/vue.js");
const io = require("socket.io-client");
const msgHandler = require("./clientUtil");

const broadcast = "Broadcast";

window.onload = function () {

    const messages = new Map();

    messages.add = function (sender, recipient, text) {
        const key = sender === appChat.nickName ? recipient : recipient === broadcast ? broadcast : sender;
        if (!messages.has(key)) {
            messages.set(key, []);
            appChat.update();
        }
        messages.get(key).push({sender: sender, recipient: recipient, text: text, self: sender === appChat.nickName});
        if (!appChat.messages)
            appChat.messages = messages.get(appChat.selectedUser);
        if (sender === appChat.nickName)
            appChat.selectedUser = recipient;

        // deal with asynchronous update
        if (key === appChat.selectedUser) {
            appChat.$nextTick(function () {
                const container = document.getElementById("dialogue-container").parentNode;
                container.scrollTop = container.scrollHeight;
            });
        }
    };

    function createDownload(fileName, blob) {
        return "<a href=" + URL.createObjectURL(blob) + " download='" + fileName + "'>" + fileName + "</a>";
    }

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
                messages.add(broadcast, appChat.nickName, "System: " + msg.text);
                break;
            default:
                console.error("unsupported message type: " + msg.type);
        }
    }

    function notify(msg) {
        if (msg.sender !== appChat.nickName && msg.recipient !== broadcast) {
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

            new Notification(msg.sender, {body: text});
        }
    }

    let appChat = new Vue({
        el: '#chat',
        data: {
            nickName: null,
            messages: null,
            users: null,
            userList: null,
            selectedUser: broadcast,
            keyword: null,
            chatText: null,
            room: null
        },
        methods: {
            update: function () {
                this.users = Array.from(messages.keys());
            }, textBtnClick: function () {
                if (this.chatText !== null && this.chatText !== "") {
                    msgHandler.requester["text-message"](this.chatText, this.selectedUser);
                    this.chatText = "";
                }
            }, textEnter: function (e) {
                if (e.which === 13) {
                    e.preventDefault();
                    if (e.ctrlKey)
                        this.chatText += "\n";
                    else
                        this.textBtnClick();
                }
            }, postChange: function () {
                const files = $("#post")[0].files;
                const selectedUser = this.selectedUser;
                if (files.length !== 0) {
                    let reader = new FileReader();
                    reader.onload = function (e) {
                        const data = e.target.result;
                        const fileName = files[0].name;
                        msgHandler.requester["file-message"](data, fileName, selectedUser);
                    };
                    reader.readAsDataURL(files[0]);
                }
            }
        },
        computed: {
            filteredUsers: function () {
                const keyword = this.keyword ? this.keyword.toLowerCase() : "";
                if (this.users)
                    return this.users.filter(function (u) {
                        return !keyword || u.toLowerCase().includes(keyword);
                    });
            }
        },
        watch: {
            selectedUser: function (newUser) {
                this.messages = messages.get(newUser);
            }
        }
    });

    const socket = io(SERVER_ADDR);

    socket.on("connect", function () {
        msgHandler.handler["connect"](socket);
        msgHandler.requester["client-hello"]();
    });

    socket.on("server-hello", function (data) {
        msgHandler.handler["server-hello"](data);
    });

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
            if (result.oldName === appChat.nickName || !result.oldName) {
                appChat.nickName = result.newName;
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
        if (result.success)
            appChat.room = result.room;
        else
            display({type: "system", text: "Join " + result.room + " failed."});
    });
}

module.exports.broadcast = broadcast;