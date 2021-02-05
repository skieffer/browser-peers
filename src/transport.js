/*! browser-peers v0.1.0 | Copyright (c) 2020-2021 Steve Kieffer | MIT license */
/* SPDX-License-Identifier: MIT */

import {ExtensionUnavailableError} from "./errors";
import {PsCsPeer} from "./pscspeer";

export class SocketTransport {

    /*
     * @param socket: a Socket instance (as returned by a call to `io(namespace)`,
     *   using the Socket.IO client library) that has been set up to communicate with
     *   a (remote) server that supports the WindowPeer protocol.
     */
    constructor(socket) {
        this.socket = socket;
    }

    setProtocolHandler(name, handler) {
        this.socket.on(name, handler);
    }

    addListener(eventType, callback) {
        this.socket.on(eventType, callback);
    }

    emit(event, message) {
        this.socket.emit(event, message);
    }

    getName() {
        const fullId = this.socket.id;
        return fullId.split("#")[1];
    }

    get connected() {
        return this.socket.connected;
    }

}

export class ExtensionTransport {

    /*
     * @param name: a unique name for the window in which this transport is
     *   being used.
     * @param ext_name: the name of the extension. as in the ExtensionClient
     *   constructor.
     * @param server_name: the name of the WindowGroupServer instance in the
     *   extension's background script.
     */
    constructor(name, ext_name, server_name) {
        this.ext_client = new PsCsPeer(name, ext_name);
        this.server_name = server_name;
    }

    setProtocolHandler(name, handler) {
        this.ext_client.addHandler(name, handler);
    }

    addListener(eventType, callback) {
        this.ext_client.on(eventType, callback);
    }

    emit(event, message) {
        this.ext_client.makeRequest(this.server_name, event, message)
            .catch(reason => {
                if (reason instanceof ExtensionUnavailableError) {
                    this.ext_client.dispatch('disconnect');
                }
            });
    }

    getName() {
        return this.ext_client.name;
    }

    get connected() {
        return true;
    }

}
