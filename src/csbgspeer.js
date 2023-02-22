/*! browser-peers v0.2.1 | Copyright (c) 2020-2023 Steve Kieffer | MIT license */
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
        console.debug(`CsBgsPeer "${name}" was constructed ${this.constructionTime}`);
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
                console.debug(`Conn from "${peerName}" accepted by CsBgsPeer ${this.name} constructed at ${this.constructionTime}`);
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
            console.debug(`Port from ${this.name} to "${peerName}" disconnected`);
            this.portsByPeerName.delete(peerName);
        });
    }

    // ------------------------------------------------------------------------
    // Override abstract base class methods

    getAllPeerNames() {
        return Array.from(this.portsByPeerName.keys());
    }

    postMessageAsPeer(peerName, wrapper) {
        /* Starting with "Manifest V3", background pages are non-persistent, and run instead as
           service workers. It seems (in Chrome 102.0.5005.115 at least) that these workers will
           be stopped by force after abt 5 min of inactivity, even if you have an open Port.
           Therefore we now begin by attempting to reopen a connection if it seems to have been closed.
         */
        if (!this.portsByPeerName.has(peerName)) {
            this.openConnection(peerName);
            console.debug(`CsBgsPeer re-opened port to ${peerName}`);
        }
        const port = this.portsByPeerName.get(peerName);
        if (!port) {
            throw `Could not open port to ${peerName}`;
        }
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


/*
 * This is a client class, which is meant to be instantiated in a content script,
 * and make requests of a CsBgsPeer, using a fresh port for each request, and
 * throwing each port away as soon as its response comes back.
 *
 * It is reasonable to ask what is the purpose of such a class, when we usually
 * say the purpose of ports is to maintain long-lived connections for multiple
 * requests and responses. However, in fact there is another reason to use ports,
 * and this is that they are the _fastest_ way to send data between CS and BGS,
 * which can be important when sending large byte arrays.
 *
 * Why then should the ports be used only for a single request, before throwing
 * them away? This is in order to support browser extensions under Manifest V3,
 * where the BGS can be terminated at any time (currently, Chrome seems to terminate
 * the BGS after 5 minutes of inactivity, even if there are open ports). The BGS is
 * started anew in response to events on which it has registered listeners. This
 * means a client that tried to reuse a port would always be in danger of using
 * a stale port, whose recipient had vanished. Tests have shown it is no use trying
 * to monitor disconnect events either; we repeatedly found that no such event
 * was received on the CS side, when the BGS was forcibly closed by the browser.
 */
export class CsBgsPortClient extends Peer {

    constructor(name) {
        super(name);
        console.debug(`CsBgsPortClient "${name}" was constructed ${this.constructionTime}`);
    }

    fromAddress() {
        return `${this.name}-${this.nextSeqNum}`;
    }

    openConnection(peerName) {
        const portName = `${this.fromAddress()}#${peerName}`;
        const port = browser.runtime.connect({name: portName});
        port.onMessage.addListener(wrapper => {
            console.assert(wrapper.type === 'response', 'A CsBgsPortClient should never receive requests.');
            port.disconnect();
            this.handleMessage(wrapper);
        });
        return port;
    }

    postMessageAsPeer(peerName, wrapper) {
        const port = this.openConnection(peerName);
        if (!port) {
            throw `Could not open port to ${peerName}`;
        }
        port.postMessage(wrapper);
    }

}
