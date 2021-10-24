/*! browser-peers v0.1.0 | Copyright (c) 2020-2021 Steve Kieffer | MIT license */
/* SPDX-License-Identifier: MIT */

const browser = require("webextension-polyfill");

import { Peer } from "./peer";

/*
 * This peer class supports symmetrical communication between content
 * scripts (CS) and background scripts (BGS) in a browser extension, via use
 * of the browser.runtime.Port class.
 *
 * Communication is symmetrical in the usual way (either side can initiate a
 * request, and receive a promise that resolves with a response from the other side).
 *
 * Establishing connections however is asymmetrical: the peer on the CS side must
 * open the connection. This is because to go in the other direction would require
 * use of `browser.tabs`, and we are trying to keep things simple and avoid that.
 */
export class CsBgsPeer extends Peer {

    /*
     * @param name {string} MUST NOT contain the `#` character. Otherwise should
     *   be any unique name with which to tell this peer apart from all others.
     */
    constructor(name) {
        super(name);
        this.portsByPeerName = new Map();
        browser.runtime.onConnect.addListener(this.acceptConnection.bind(this));
    }

    // ------------------------------------------------------------------------
    // Connections

    /* Open a connection with another peer.
     *
     * This method can only be called on peers living on the CS side, since it
     * uses `browser.runtime.connect`.
     *
     * @param peerName {string} the name of the peer to which we wish to connect.
     */
    openConnection(peerName) {
        /* In order for peer P to connect to peer Q, P must be on the CS side, and must
        * call `browser.runtime.connect`, passing as name of the port a string of the
        * form `${nameOfP}#${nameOfQ}`. */
        const portName = `${this.name}#${peerName}`;
        const port = browser.runtime.connect({name: portName});
        this.savePortAndListen(peerName, port);
    }

    acceptConnection(port) {
        if (port.name) {
            const [peerName, myName] = port.name.split("#");
            if (myName === this.name) {
                this.savePortAndListen(peerName, port);
            }
        }
    }

    savePortAndListen(peerName, port) {
        this.portsByPeerName.set(peerName, port);
        port.onMessage.addListener(this.handleMessage.bind(this));
        // In both Chrome and Firefox, the disconnect event will in particular be fired
        // for a CS-side port if and when the tab in which it lives closes. So this
        // listener provides a bookkeeping solution for closing tabs.
        port.onDisconnect.addListener(() => {
            //console.log(`port to ${peerName} disconnected`);
            this.portsByPeerName.delete(peerName);
        });
    }

    // ------------------------------------------------------------------------
    // Override abstract base class methods

    getAllPeerNames() {
        return Array.from(this.portsByPeerName.keys());
    }

    postMessageAsPeer(peerName, wrapper) {
        const port = this.portsByPeerName.get(peerName);
        try {
            port.postMessage(wrapper);
        } catch (e) {
            /* Just in case the port was somehow disconnected but our bookkeeping efforts failed to
             * note it, we want to gracefully remove the port from our records now.
             * Last I checked (Chrome 85.0.4183.121 and Firefox Developer Edition 82.0b7),
             * Chrome says, "Attempting to use a disconnected port object",
             * while Firefox says, "Attempt to postMessage on disconnected port".
             */
            if (e.message && e.message.indexOf('disconnected port') >= 0) {
                console.log(`Caught disconnected port "${port.name}"`);
                const [name1, name2] = port.name.split("#");
                // One name should be that of our peer, one our own.
                // We can safely attempt to delete both from our mapping.
                this.portsByPeerName.delete(name1);
                this.portsByPeerName.delete(name2);
            } else {
                throw e;
            }
        }
    }

}
