/*! browser-peers v0.1.0 | Copyright (c) 2020-2021 Steve Kieffer | MIT license */
/* SPDX-License-Identifier: MIT */

import {ExtensionUnavailableError} from "./errors";
import {PsCsPeer} from "./pscspeer";

export class BroadcastChannelTransport {

    constructor(options) {
        const {
            channelName = 'Window-Peer-Protocol-Channel',
            eventNamePrefix = '',
        } = options || {};

        this.eventNamePrefix = eventNamePrefix;
        this.channelName = channelName;
        this.windowGroupId = this.channelName;
        this.name = `${Math.random()}${Math.random()}${Math.random()}`;
        this.protocolHandlers = new Map();

        this.bc = new BroadcastChannel(this.channelName);
        this.bc.addEventListener('message', event => {
            this.receive(event.data);
        });

        const basicNames = ['join', 'depart', 'hello', 'welcome', 'observeDeparture',
            'handleWindowMessage', 'postWindowMessage', 'genericWindowEvent', 'sendWindowEvent'];
        this.eventName = {};
        for (let name of basicNames) {
            this.eventName[name] = eventNamePrefix + name;
        }
    }

    broadcast(eventType, message, options) {
        const {
            whitelist = [],
            blacklist = [],
        } = options || {};
        const wrapper = {
            type: eventType,
            whitelist: whitelist,
            blacklist: blacklist,
            message: message,
        };
        //console.log('Broadcasting: ', wrapper);
        this.bc.postMessage(wrapper);
        // BroadcastChannels do _not_ send to themselves, so we have to do that manually:
        this.receive(wrapper);
    }

    appliesToMe(whitelist, blacklist) {
        return whitelist.includes(this.name) || (whitelist.length === 0 && !blacklist.includes(this.name));
    }

    receive({type, whitelist, blacklist, message}) {
        //console.log('Receiving: ', {type, whitelist, blacklist, message});
        if (this.appliesToMe(whitelist, blacklist)) {
            const handler = this.protocolHandlers.get(type);
            if (handler) {
                handler(message);
            } else {
                console.error(`No handler for event: ${type}`);
            }
        }
    }

    setProtocolHandler(name, handler) {
        this.protocolHandlers.set(name, handler);
    }

    addListener(eventType, callback) {
        // The WindowPeer class only wants to listen to `connect` and `disconnect` events,
        // but those are really only needed by the socket transport. We don't need to do anything here.
    }

    emit(event, message) {
        switch (event) {
            case this.eventName.join:
                this.broadcast(this.eventName.hello, {
                    windowGroupId: this.windowGroupId,
                    name: this.name,
                    birthday: message.birthday,
                });
                break;
            case this.eventName.welcome:
                this.broadcast(this.eventName.welcome, message, {
                    whitelist: [message.to]
                });
                break;
            case this.eventName.depart:
                this.broadcast(this.eventName.observeDeparture, {'name': this.name}, {
                    blacklist: [this.name]
                });
                break;
            case this.eventName.postWindowMessage:
                this.broadcast(this.eventName.handleWindowMessage, message, {
                    whitelist: message.room === this.windowGroupId ? [] : [message.room],
                });
                break;
            case this.eventName.sendWindowEvent:
                this.broadcast(this.eventName.genericWindowEvent, message.event || {}, {
                    whitelist: message.room === this.windowGroupId ? [] : [message.room],
                    blacklist: message.includeSelf === false ? [this.name] : [],
                });
                break;
            default:
                console.error(`No emitter for event: ${event}`);
        }
    }

    getName() {
        return this.name;
    }

    get connected() {
        return true;
    }

}

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
        /* In v2.x of the socketio client, the `id` would be of the form
         *   /NAMESPACE#HASH
         * and we wanted just the HASH, so we split on "#" and took the last part.
         * In v4.x (have not experimented with v3.x), the `id` is just a HASH.
         * The following code works for both versions.
         */
        return fullId.split("#").slice(-1)[0];
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
