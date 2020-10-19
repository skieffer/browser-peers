const $ = require('jquery');
const io = require('socket.io-client')

import { SocketPeer } from "../socketpeer";

$(document).ready(function() {

    const namespace = '/socketPeers';
    const socket = io(namespace);
    const peer = new SocketPeer(socket);

    peer.on('updateMapping', event => {
        const numbers = peer.getAllWindowNumbers();
        const myNumber = peer.getWindowNumber();
        const otherNumbers = numbers.filter(n => n !== myNumber);
        let rbs = '';
        for (let n of otherNumbers) {
            rbs += `<label><input type="radio" name="dest" value="${n}">${n}</label>\n`;
        }
        $('#radioBox').html(rbs);
    });

    function logMessage(msg) {
        $('#log').append('<br>' + $('<div/>').text(msg).html());
    }

    peer.addHandler('log', args => {
        logMessage(`From window #${args.src}: ${args.msg}`);
    });

    $('form#send').submit(function(event) {
        const checked = document.querySelector("input[name=dest]:checked");
        if (checked) {
            const dest = +checked.value;
            //console.log(dest);
            const src = peer.getWindowNumber();
            const mb = $('#messageBox')
            const msg = mb.val();
            mb.val('');
            peer.makeWindowRequest(dest, 'log', {
                src: src,
                msg: msg,
            });
        }
        return false;
    });

    peer.join();

});
