
const $ = require('jquery');

import { PsCsPeer } from "../../src/pscspeer";
import { ExtensionTransport } from "../../src/transport";
import { makeSimpleDemoPeer } from "../peer_demo";

$(document).ready(function() {

    const eventNamePrefix = 'myWindowPeersPrefix';

    const pageClientName = `pageClient-@(${(new Date()).toISOString()})-${Math.random()}`;
    const client = new PsCsPeer(pageClientName, 'wg-demo-ext');

    client.makeRequest('gateway','get-window-name', {}, {timeout: 1000})
        .then(windowName => {
            const transport = new ExtensionTransport(
                windowName, 'wg-demo-ext', 'myWindowGroupServer'
            );
            const peer = makeSimpleDemoPeer(transport, eventNamePrefix);
            peer.enable();
        })
        .catch(reason => {
            console.error(reason);
        });

});
