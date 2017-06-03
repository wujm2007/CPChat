const SERVER_ADDR = "http://localhost:8088";

const Vue = require("vue/dist/vue.js");
const io = require("socket.io-client");
const {msgRequester, msgHandler, broadcast} = require("./clientUtil");

window.onload = function () {

    function createDownload(fileName, blob) {
        return "<a href=" + URL.createObjectURL(blob) + " download='" + fileName + "'>" + fileName + "</a>";
    }

    function display(msg) {
        switch (msg.type) {
            case "file":
                fetch(msg.data).then((res) => res.blob()).then((blob) => {
                    vm.pushMessage(msg.sender, msg.recipient, createDownload(msg.fileName, blob));
                });
                break;
            case "text":
                vm.pushMessage(msg.sender, msg.recipient, msg.text);
                break;
            case "system":
                vm.pushMessage(broadcast, vm.nickname, "[System] " + msg.text);
                break;
            default:
                console.error("unsupported message type: " + msg);
        }
    }

    function notify(msg) {
        if (msg.sender !== vm.nickname && msg.recipient !== broadcast) {
            let text;

            switch (msg.type) {
                case "file":
                    text = msg.fileName;
                    break;
                case "text":
                    text = msg.text;
                    break;
                default:
                    console.error("unsupported message type: " + msg);
                    return;
            }

            const notification = new Notification(msg.sender, {body: text});
            notification.onclick = () => {
                if (vm.userList.includes(msg.sender))
                    vm.selectedUser = msg.sender;
            }
        }
    }

    let vm = new Vue({
        el: '#chat',
        data: {
            messages: new Map(),
            nickname: null,
            chatMessages: null,
            chatList: null,
            userList: null,
            selectedUser: broadcast,
            keyword: null,
            textInput: null,
            room: null
        },
        methods: {
            pushMessage: function (sender, recipient, text) {
                const key = sender === this.nickname ? recipient : recipient === broadcast ? broadcast : sender;
                if (!this.messages.has(key)) {
                    this.messages.set(key, []);
                    this.updateChatList();
                }
                this.messages.get(key).push({
                    sender: sender,
                    recipient: recipient,
                    text: text,
                    self: sender === this.nickname
                });
                if (!this.chatMessages)
                    this.chatMessages = this.messages.get(this.selectedUser);
                if (sender === this.nickname)
                    this.selectedUser = recipient;
            },
            updateChatList: function () {
                this.chatList = Array.from(this.messages.keys());
            },
            textBtnClick: function () {
                if (this.textInput !== null && this.textInput !== "") {
                    msgRequester["text-message"](this.textInput, this.selectedUser);
                    this.textInput = "";
                }
            },
            textEnter: function (e) {
                if (e.which === 13) {
                    e.preventDefault();
                    if (e.ctrlKey)
                        this.textInput += "\n";
                    else
                        this.textBtnClick();
                }
            },
            postChange: function () {
                const files = document.querySelector("#post").files;
                const selectedUser = this.selectedUser;
                if (files.length !== 0) {
                    let reader = new FileReader();
                    reader.onload = function (e) {
                        const data = e.target.result;
                        const fileName = files[0].name;
                        msgRequester["file-message"](data, fileName, selectedUser);
                    };
                    reader.readAsDataURL(files[0]);
                }
            }
        },
        computed: {
            filteredUsers: function () {
                const keyword = this.keyword ? this.keyword.toLowerCase() : "";
                if (this.chatList)
                    return this.chatList.filter(function (u) {
                        return u.toLowerCase().includes(keyword);
                    });
            }
        },
        watch: {
            selectedUser: function (newUser) {
                console.log("change to ", newUser);
                this.chatMessages = this.messages.get(newUser);
            },
            chatMessages: function () {
                this.$nextTick(function () {
                    const container = document.querySelector("#dialogue-container").parentNode;
                    container.scrollTop = container.scrollHeight;
                });
            }
        }
    });

    const socket = io(SERVER_ADDR);

    socket.on("connect", function () {
        msgHandler["connect"](socket);
        msgRequester["client-hello"]();
    });

    socket.on("server-hello", function (data) {
        msgHandler["server-hello"](data);
    });

    socket.on("push-message", function (data) {
        const msg = msgHandler.handle(data);
        display(msg);
        notify(msg);
    });

    socket.on("whisper-ack", function (data) {
        const msg = msgHandler.handle(data);
        display(msg);
    });

    socket.on("name-result", function (data) {
        const result = msgHandler.handle(data);
        if (result.success) {
            if (result.oldName === vm.nickname || !result.oldName) {
                vm.nickname = result.newName;
                display({type: "system", text: "Your name is now " + result.newName});
            } else {
                display({type: "system", text: result.oldName + " is now known as " + result.newName});
            }
            // replace key-value in messages
            if (vm.messages.has(result.oldName)) {
                const list = vm.messages.get(result.oldName);
                vm.messages.delete(result.oldName);
                vm.messages.set(result.newName, list);
                vm.updateChatList();
            }
            // "user-list" may arrive after "name-result" so userList shoule be modified
            // to prevent v-model changing select value to undefined
            if (vm.userList && vm.userList.includes(result.oldName))
                vm.userList[vm.userList.indexOf(result.oldName)] = result.newName;
            if (vm.selectedUser === result.oldName)
                vm.selectedUser = result.newName;
        }
        else
            display({type: "system", text: "Rename failed, " + result.message});
    });

    socket.on("message", function (data) {
        const msg = msgHandler.handle(data);
        display({type: "system", text: msg.text});
    });

    socket.on("user-list", function (data) {
        const list = msgHandler.handle(data);
        vm.userList = [broadcast].concat(list);
        vm.chatList.forEach(function (u) {
            if (!list.includes(u) && u !== broadcast) {
                vm.messages.delete(u);
                if (vm.selectedUser === u)
                    vm.selectedUser = broadcast;
            }
        });
        vm.updateChatList();
    });

    socket.on("join-room", function (data) {
        const result = msgHandler.handle(data);
        if (result.success)
            vm.room = result.room;
        else
            display({type: "system", text: "Join " + result.room + " failed."});
    });
};