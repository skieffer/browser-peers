/*! browser-peers v0.1.0 | Copyright (c) 2020-2021 Steve Kieffer | MIT license */
/* SPDX-License-Identifier: MIT */


const $ = require('jquery');

import { WindowPeer } from "../src/windowpeer";

/* Make a WindowPeer for use with demo_page.html
 */
export function makeSimpleDemoPeer(transport, eventNamePrefix) {
    const peer = new WindowPeer(transport, {
        eventNamePrefix: eventNamePrefix,
    });

    peer.on('updateMapping', event => {
        console.log(event);
        const numbers = peer.getAllWindowNumbers();
        const myNumber = peer.getWindowNumber();
        const otherNumbers = numbers.filter(n => n !== myNumber);

        if (otherNumbers.length) {
            let title = `Window (${myNumber})`;
            document.title = title;
            $('#identity').html(title);
            $("input").prop( "disabled", false );
        } else {
            document.title = 'Window';
            $('#identity').html('the only window.');
            $("input").prop( "disabled", true );
        }

        let rbs = '';
        for (let n of otherNumbers) {
            rbs += `<label><input type="radio" name="dest" value="${n}" ${rbs.length ? "" : "checked"}>${n}</label>\n`;
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

    return peer;
}