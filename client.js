//main.js
const SERVER_ADDR = 'http://192.168.31.44:8088';

const $ = require("jquery");
const cryptoUtil = require('./CryptoUtil.js');
const io = require('socket.io-client');
const socket = io(SERVER_ADDR);

window.AES256Cipher = cryptoUtil.AES256Cipher;
window.AES256Decipher = cryptoUtil.AES256Decipher;

$(document).ready(function () {
    let nickName = "Default User";

    socket.on('connect', function () {
        console.log("connected to server");
    });

    socket.on('push message', function (msg) {
        if (msg.encrypted)
            msg.text = window.AES256Decipher(msg.text, socket.id);
        $('#dialogue-container').append($('<li>').text(msg.sender + ": " + msg.text + " (" + msg.time + ")"));
    });

    socket.on('push base64 file', function (msg) {
        $('#dialogue-container').append($('<img class="chatImg" src="' + msg + '"/>'));
    });
    socket.on('name result', function (msg) {
        if (msg.success) {
            nickName = msg.name;
        } else {
            $('#dialogue-container').append($('<li>').text("Rename failed, " + msg.message));
        }
    });
    socket.on("message", function (msg) {
        $('#dialogue-container').append($('<li>').text(msg.text));
    });
    socket.on("cls", function () {
        $('#dialogue-container').html('');
    });

    $("#btnText").click(function () {
        let inputText = $("input[name='chatText']");
        if (inputText.val() !== null && inputText.val() !== "") {
            let words = inputText.val().split(' ');
            let command = words[0].toLowerCase();
            switch (command) {
                case '\\join':
                    words.shift();
                    let room = words.join('');
                    socket.emit('room attempt', room);
                    break;
                case '\\nick':
                    words.shift();
                    let name = words.join('');
                    socket.emit('name attempt', name);
                    break;
                case '\\to':
                    words.shift();
                    let recipient = words[0];
                    words.shift();
                    let message = words.join(' ');
                    socket.emit('whisper', {
                        recipient: recipient,
                        sender: nickName,
                        text: message,
                        time: new Date().toLocaleString()
                    });
                    break;
                default:
                    socket.emit('chat', {
                        sender: nickName,
                        text: inputText.val(),
                        time: new Date().toLocaleString()
                    });
                    break;
            }
            inputText.val('');
        }
    });

    $('#postImg').change(function () {
        let files = $('#postImg')[0].files;
        if (files.length !== 0) {
            let reader = new FileReader();
            reader.onload = function (evt) {
                let file = evt.target.result;
                socket.emit('base64 file', file);
            };
            reader.readAsDataURL(files[0]);
        }
    });

    $("#chatText").keypress(function (e) {
        if (e.ctrlKey && e.which === 13)
            $("#btnText").click();
    });
});