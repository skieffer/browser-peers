/*! browser-peers v0.1.0 | Copyright (c) 2020-2021 Steve Kieffer | MIT license */
/* SPDX-License-Identifier: MIT */


import { Peer } from "./peer";
import { xhr } from "./util";

/* This peer is for communication between different browser tabs -- which we
 * call "windows" here, although the may well be tabs in the same browser window.
 *
 * It requires the use of Socket.IO, and is not a complete solution unto itself,
 * but also requires that its communication protocol be supported on the server
 * side. See `example/app.py` in this repo.
 *
 * After constructing an instance, you must call `.join()` on the instance in order
 * to join what we call the "window group", i.e. the set of browser tabs that are
 * able to communicate with one another. You should be prepared to catch an error if
 * the XHR involved in the join call should fail for any reason.
 */
export class SocketPeer extends Peer {

    // FIXME: Do we want the constructor to maybe take the namespace, instead of
    //  an existing socket object?

    /*
     * @param socket {Socket} A Socket instance as returned by a call to `io(namespace)`,
     *   using the Socket.IO client library.
     * @param options {
     *   namespace: ...
     *   joinHttpRoute {string} the URL under which your server has published the HTTP route
     *     to which this class needs to submit its SID in order to join the window group.
     *     See `example/app.py` in this repo.
     *   eventName: object in which you may specify alternative names for the socket events
     *     that make up the protocol employed by this class in order to maintain its connections
     *     to its peers. Since you can already choose the namespace, you probably don't need
     *     to change any of these event names, but you may do so if you wish.
     * }
     */
    constructor(socket, options) {
        // Temporarily pass empty string as our name:
        super('');
        this.socket = socket;

        /* A socket can easily have its connection interrupted, and then reconnect.
         * To help us associate old connections with new, we keep a history of all
         * SIDs we've ever had. The order is from newest to oldest. So, whenever
         * we have an SID, it is at index 0 in this array: */
        this.sidHistory = [];

        // Record new SIDs, and resolve and pending promises with them:
        this.sidResolves = [];
        this.socket.on('connect', () => {
            const sid = this.sidFromFullId(this.socket.id)
            this.sidHistory.unshift(sid);
            const resolves = this.sidResolves;
            this.sidResolves = [];
            for (let resolve of resolves) {
                resolve(sid);
            }
        })

        // As soon as we are connected and have our real name, record it:
        this.getSid().then(sid => {
            this.name = sid;
        });

        const {
            namespace = '/socketPeers',
            joinHttpRoute = '/joinSessionWindowGroup',
            eventName = {},
        } = options || {};
        this.namespace = namespace;
        this.joinHttpRoute = joinHttpRoute;
        this.eventName = {
            success: eventName.success || 'success',
            error:   eventName.error || 'error',
            disconnectRequest: eventName.disconnectRequest || 'disconnectRequest',
            publishWindowGroupMapping: eventName.publishWindowGroupMapping || 'publishWindowGroupMapping',
            addNewWindowToGroup: eventName.addNewWindowToGroup || 'addNewWindowToGroup',
            updateWindowGroupMapping: eventName.updateWindowGroupMapping || 'updateWindowGroupMapping',
            windowDisconnected: eventName.windowDisconnected || 'windowDisconnected',
            handleWindowRequest: eventName.handleWindowRequest || 'handleWindowRequest',
            makeWindowRequest: eventName.makeWindowRequest || 'makeWindowRequest',
            respondToWindowRequest: eventName.respondToWindowRequest || 'respondToWindowRequest',
        };

        this.windowGroupId = null;
        this.windowNumber = null;
        this.windowMapping = null; // map window numbers to SIDs

        this.setUpProtocolHandlers();

        window.addEventListener("beforeunload", () => {
            this.socket.emit(this.eventName.disconnectRequest, {});
        }, false);
    }

    sidFromFullId(fullId) {
        return fullId.split("#")[1];
    }

    /* For use only in contexts where we know we are connected, and so must
     * already have a current SID.
     */
    get sid() {
        return this.sidHistory[0];
    }

    /* Get the SID of this socket, i.e. the ID used by the server to
     * send a message to this socket.
     *
     * @return: promise that resolves with the SID of the socket.
     */
    getSid() {
        if (this.socket.connected) {
            return Promise.resolve(this.sidFromFullId(this.socket.id));
        } else {
            return new Promise(resolve => {
                this.sidResolves.push(resolve);
            });
        }
    }

    /* Join the window group.
     *
     * @throws: Error if the XHR fails.
     */
    join() {
        this.getSid().then(sid => {
            console.log('my sid', sid);
            xhr(this.joinHttpRoute, {
                query: { sid: sid, },
                handleAs: "json",
            }).then(response => {
                this.windowGroupId = response.windowGroupId;
            });
        });
    }

    // -----------------------------------------------------------------------
    // Protocol implementation

    setUpProtocolHandlers() {
        this.socket.on(this.eventName.addNewWindowToGroup, this.addNewWindowToGroup.bind(this));
        this.socket.on(this.eventName.updateWindowGroupMapping, this.updateWindowGroupMapping.bind(this));
        this.socket.on(this.eventName.windowDisconnected, this.windowDisconnected.bind(this));
        this.socket.on(this.eventName.handleWindowRequest, this.handleWindowRequest.bind(this));
    }

    addNewWindowToGroup(msg) {
        console.log('addNewWindowToGroup socket event received', msg);
        const windowGroupId = msg.windowGroupId;
        const newSid = msg.sid;
        if (newSid === this.sid) {
            return;
        }
        if (this.windowNumber === null) {
            this.windowNumber = 1;
            this.adoptMapping({
                1: this.sid,
                2: newSid,
            });
            // Must pass here the windowGroupId we were given, since this event
            // handler might take place before we learn what our group id is,
            // i.e. before this.windowGroupId is set.
            this.publishWindowGroupMapping(windowGroupId);
        } else if (this.isLeader()) {
            const n = this.chooseNextWindowNumber();
            this.windowMapping.set(n, newSid);
            this.publishWindowGroupMapping(windowGroupId);
        }
    }

    updateWindowGroupMapping(msg) {
        this.adoptMapping(msg);
        if (this.windowNumber === null) {
            this.adoptNumberFromMapping();
        }
        console.log('after updateWindowGroupMapping', this);
    }

    windowDisconnected(msg) {
        console.log('windowDisconnected', msg);
        const lostSid = msg.sid;
        // First remove the lost sid from the mapping.
        this.removeSidFromWindowMapping(lostSid);
        // Now if, after removal, we are the leader, do what needs doing.
        // This means that in the special case where the former leader was
        // the window that closed, the next in line will take over here.
        if (this.isLeader()) {
            this.publishWindowGroupMapping(this.windowGroupId);
        }
    }

    // FIXME: this should be somehow using the abstract base class
    /* msg format: {
     *   seqNum {int},
     *   dstWindowSid {string},
     *   srcWindowSid {string},
     *   handlerDescrip {string},
     *   payload {any}
     * }
     */
    handleWindowRequest(msg) {
        const handler = this.lookupHandler(msg.handlerDescrip);
        if (!handler) {
            msg.rejection_reason = `Unknown handler: ${msg.handlerDescrip}`;
            this.emit('respondToWindowRequest', msg);
        }
        Promise.resolve(handler(msg.payload)).then(result => {
            msg.result = result;
            this.emit('respondToWindowRequest', msg);
        }).catch(reason => {
            msg.rejection_reason = reason;
            this.emit('respondToWindowRequest', msg);
        });
    }

    // -----------------------------------------------------------------------
    // Misc internals

    isLeader() {
        if (this.windowNumber === null) return false;
        return this.windowNumber === Math.min(...this.windowMapping.keys());
    }

    removeSidFromWindowMapping(sid) {
        let number;
        for (let [k, v] of this.windowMapping) {
            if (v === sid) {
                number = k;
                break;
            }
        }
        this.windowMapping.delete(number);
    }

    chooseNextWindowNumber() {
        if (this.windowMapping === null) return 0;
        let n = 1;
        while (this.windowMapping.has(n)) n++;
        return n;
    }

    adoptMapping(mappingObject) {
        const m = new Map();
        for (let k in mappingObject) {
            if (mappingObject.hasOwnProperty(k)) {
                m.set(+k, mappingObject[k]);
            }
        }
        this.windowMapping = m;
    }

    makeMappingObject() {
        const obj = {};
        for (let [k, v] of this.windowMapping) {
            obj[k] = v;
        }
        return obj;
    }

    publishWindowGroupMapping(room) {
        this.socket.emit(this.eventName.publishWindowGroupMapping, {
            "room": room,
            "mapping": this.makeMappingObject(),
        });
    }

    adoptNumberFromMapping() {
        for (let [k, v] of this.windowMapping) {
            if (v === this.sid) {
                this.windowNumber = k;
                return;
            }
        }
        throw new Error(`Could not find sid ${this.sid} in window mapping`);
    }

    // ------------------------------------------------------------------------
    // API

    /* Get the number of this window.
     *
     * @return {int} this window's number.
     */
    getWindowNumber() {
        return this.windowNumber;
    }

    /* Get the array of all window numbers sorted in increasing order.
     *
     * @return {Array[int]} all window numbers sorted in increasing order.
     */
    getAllWindowNumbers() {
        return Array.from(this.windowMapping.keys()).sort();
    }

    // FIXME: should be somehow using the abstract base class
    /* Send a request to another window, and receive a promise that resolves
     * with the response from that window.
     *
     * @param windowNumber {int} the number of the window you want to contact.
     * @param handlerDescrip {string} description of the desired request handler
     *   to be invoked on the other side.
     * @param payload {obj} the message you want to send to that window,
     *   representing your request.
     * @return: promise that resolves with the other window's response, or else
     *   rejects with an error.
     */
    makeWindowRequest(windowNumber, handlerDescrip, payload) {
        const dstWindowSid = this.windowMapping.get(windowNumber);
        if (typeof dstWindowSid === 'undefined') {
            throw new Error(`Unknown window number: ${windowNumber}`);
        }
        const wrapper = {
            dstWindowSid: dstWindowSid,
            handlerDescrip: handlerDescrip,
            payload: payload,
        };
        return this.emitRequest('makeWindowRequest', wrapper);
    }
}
