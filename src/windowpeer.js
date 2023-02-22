/*! browser-peers v0.2.1 | Copyright (c) 2020-2023 Steve Kieffer | MIT license */
/* SPDX-License-Identifier: MIT */

import { Peer } from "./peer";
import { UnknownPeerError, NoGroupError } from "./errors";

/* This peer is for communication between different browser tabs -- which we
 * call "windows" here, although the may well be tabs in the same browser window.
 *
 * This class is however not a complete solution unto itself. It requires that its
 * communication protocol be supported either by a browser extension, or by an external
 * server. Accordingly, you must pass it an instance of one of the Transport classes
 * defined in the `transport.js` module.
 *
 * Note: After constructing a WindowPeer, you must call its `.enable()` method in order
 * to join what we call the "window group", i.e. the set of browser tabs that are
 * able to communicate with one another. This is to give you a chance to register
 * your own handlers and listeners before activation. Handlers and listeners are
 * registered as in the base Peer class.
 */
export class WindowPeer extends Peer {

    /*
     * @param transport: an instance of a Transport class. See transport.js.
     *   Note: you may pass `null` at construction time, and set the transport later,
     *   using either the `setTransport()` method or the `enable()` method. This can be
     *   useful in cases where you want to be able to register listeners on this peer
     *   before you are ready to enable it.
     * @param options {
     *   eventName: object in which you may specify alternative names for the socket events
     *     that make up the protocol employed by this class in order to maintain its connections
     *     to its peers.
     *   eventNamePrefix: {string} prefix you would like to add onto every event name, _including_
     *     any names you provided in `eventName`.
     * }
     */
    constructor(transport, options) {
        super(null);
        this.birthday = `${Date.now()}:${Math.random()}`;
        this.transport = transport;
        this.windowGroupId = null;

        this.peerNamesToBirthdays = new Map();
        this.windowNumbersToPeerNames = new Map();
        this.windowNumber = 0;

        const {
            eventName = {},
            eventNamePrefix = '',
        } = options || {};
        this.eventName = {
            join: eventName.join || 'join',
            depart: eventName.depart || 'depart',
            hello: eventName.hello || 'hello',
            welcome: eventName.welcome || 'welcome',
            observeDeparture: eventName.observeDeparture || 'observeDeparture',
            handleWindowMessage: eventName.handleWindowMessage || 'handleWindowMessage',
            postWindowMessage: eventName.postWindowMessage || 'postWindowMessage',
            genericWindowEvent: eventName.genericWindowEvent || 'genericWindowEvent',
            sendWindowEvent: eventName.sendWindowEvent || 'sendWindowEvent',
        };
        for (let k of Object.keys(this.eventName)) {
            this.eventName[k] = eventNamePrefix + this.eventName[k];
        }

        // NOTE: The peer is not active until you call the `enable()` method!
        // This is to give you a chance to register your own handlers and listeners
        // before activation.
    }

    setTransport(transport) {
        this.transport = transport;
    }

    /* Join the window group.
     *
     * @throws: Error if we don't have a name yet.
     */
    join() {
        this.setUpHandlers();
        // Note: while we do not actually need to send our name in the join
        // event, it is important that we ensure we have one by this time.
        // It will be used later.
        const name = this.transport.getName();
        if (!name) {
            throw new Error('Cannot join window group without a name.');
        }
        this.name = name;
        // Reset, in case still have garbage from a prior connection.
        this.reset();
        this.transport.emit(this.eventName.join, {birthday: this.birthday});
    }

    // -----------------------------------------------------------------------
    // Event handlers

    setUpHandlers() {
        const names = [
            "hello",
            "welcome",
            "observeDeparture",
            "handleWindowMessage",
            "genericWindowEvent",
        ];
        for (let name of names) {
            this.transport.setProtocolHandler(this.eventName[name], this[name].bind(this));
        }
    }

    /* A new peer has joined the group. Add them to our representation of the group,
     * and "welcome" them, meaning tell them our name and birthday as well.
     */
    hello({name, birthday, windowGroupId}) {
        this.windowGroupId = windowGroupId;
        // Do add even if self.
        this.addPeer(name, birthday);
        // But do not welcome self. That would be redundant.
        if (name !== this.name) {
            this.transport.emit(this.eventName.welcome, {to: name, from: this.name, birthday: this.birthday});
        }
    }

    /* We have just joined the group, and an existing member is introducing themselves.
     * Add them to our representation of the group, but do not tell them our name now, since
     * we already said hello earlier.
     */
    welcome({from, birthday}) {
        this.addPeer(from, birthday);
    }

    /* A peer is leaving the group.
     */
    observeDeparture({name}) {
        this.removePeer(name);
    }

    /* This is part of our extension of the base Peer class's functionality.
     */
    handleWindowMessage(wrapper) {
        super.handleMessage(wrapper);
    }

    /* While other socket event handlers are set off with special names to mark their
     * role in the basic protocol whereby we keep windows aware of one another, here
     * we provide space for any user-defined events users of this class may wish to
     * define.
     *
     * This is to be understood as providing an alternative to the request/response
     * system provided by our Peer base class. Using `sendWindowEvent`, any window
     * can send out an event, without expecting any response. Windows listen to
     * such events as they would to any other, using the `on` method of this class
     * to set a listener.
     *
     * An event object should be any serializable object with a `type` property,
     * indicating what type of event it is. The value of the `type` property must
     * not collide with any of the built in listenable events, listed in this
     * class's doctext.
     */
    genericWindowEvent(event) {
        this.dispatch(event);
    }

    // -----------------------------------------------------------------------
    // Misc internals

    addPeer(name, birthday) {
        this.peerNamesToBirthdays.set(name, birthday)
        this.recomputeWindowNumbers();
    }

    removePeer(name) {
        if (this.peerNamesToBirthdays.delete(name)) {
            this.recomputeWindowNumbers();
        }
    }

    recomputeWindowNumbers() {
        let deletedNumber = null;
        const peerNamesToOldWindowNumbers = new Map();
        for (let [num, name] of this.windowNumbersToPeerNames) {
            peerNamesToOldWindowNumbers.set(name, num);
            if (!this.peerNamesToBirthdays.has(name)) {
                deletedNumber = num;
            }
        }

        const A = Array.from(this.peerNamesToBirthdays.entries()).sort((p1, p2) => {
            const [bday1, bday2] = [p1[1], p2[1]];
            return bday1 < bday2 ? -1 : bday1 > bday2 ? 1 : 0;
        });

        this.windowNumbersToPeerNames.clear();
        for (let [i, [peerName, birthday]] of A.entries()) {
            this.windowNumbersToPeerNames.set(i + 1, peerName);
            if (peerName === this.name) {
                this.windowNumber = i + 1;
            }
        }

        const oldNumbersToNewNumbers = new Map();
        for (let [newNumber, peerName] of this.windowNumbersToPeerNames) {
            if (peerNamesToOldWindowNumbers.has(peerName)) {
                let oldNumber = peerNamesToOldWindowNumbers.get(peerName);
                if (newNumber !== oldNumber) {
                    oldNumbersToNewNumbers.set(oldNumber, newNumber);
                }
            }
        }

        const event = {
            type: 'updateMapping',
            target: this,
            mapping: Object.fromEntries(this.windowNumbersToPeerNames.entries()),
            numberUpdates: Object.fromEntries(oldNumbersToNewNumbers.entries()),
            deletedNumber: deletedNumber,
        };
        this.dispatch(event);
    }

    reset() {
        this.peerNamesToBirthdays.clear();
        this.windowNumbersToPeerNames.clear();
        this.windowNumber = 0;
    }

    getAllPeerNames() {
        return Array.from(this.peerNamesToBirthdays.keys());
    }

    postMessageAsPeer(peerName, wrapper) {
        wrapper.room = peerName;
        this.transport.emit(this.eventName.postWindowMessage, wrapper);
    }

    lookUpPeerName(windowNumber) {
        const peerName = this.windowNumbersToPeerNames.get(windowNumber);
        if (typeof peerName === 'undefined') {
            throw new UnknownPeerError({message: `Unknown window number: ${windowNumber}`});
        }
        return peerName;
    }

    // ------------------------------------------------------------------------
    // API

    /* Call this after adding handlers and listeners, in order to activate
     * the connection and recognize other members of the group.
     *
     * This is also the last possible moment to set the transport, if you set it
     * as null at construction time.
     *
     * @param transport: optional -- last chance to set the transport before enabling.
     */
    enable(transport) {
        if (transport) this.setTransport(transport);

        window.addEventListener("beforeunload", () => {
            this.transport.emit(this.eventName.depart);
        }, false);

        this.transport.addListener('disconnect', () => {
            this.dispatch({
                type: 'disconnect',
                target: this,
            });
        });

        // Any time we (re)connect, we need to (re)join.
        this.transport.addListener('connect', () => {
            this.join();
        });

        // If we already are connected, we can join right now. Otherwise, it will
        // happen in our 'connect' handler.
        if (this.transport.connected) {
            this.join();
        }
    }

    /* Get the window group id.
     *
     * @return {string} the window group id.
     */
    getGroupId() {
        return this.windowGroupId;
    }

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
        return Array.from(this.windowNumbersToPeerNames.keys()).sort();
    }

    /* Wraps base class's `makeRequest` method, allowing user to pass the window
     * number instead of the window's SID (since we use the latter internally as peerName).
     */
    makeWindowRequest(windowNumber, handlerDescrip, args, options) {
        const peerName = this.lookUpPeerName(windowNumber);
        return this.makeRequest(peerName, handlerDescrip, args, options);
    }

    /* Send an event, without expecting any response.
     *
     * @param windowNumber {int|null} the number of the window you want to receive the
     *   event, or null if you want to "groupcast" the event to all windows in the group.
     * @param event {obj} any object with a `type` property.
     * @param includeSelf {boolean} set false to exclude self from the groupcast when
     *   windowNumber is `null`.
     */
    sendWindowEvent(windowNumber, event, includeSelf = true) {
        let room;
        if (windowNumber === null) {
            if (!this.windowGroupId) {
                throw new NoGroupError({message: 'Cannot groupcast without windowGroupId.'});
            }
            room = this.windowGroupId;
        } else {
            room = this.lookUpPeerName(windowNumber);
        }
        const wrapper = {
            room: room,
            event: event,
            includeSelf: includeSelf,
        };
        this.transport.emit(this.eventName.sendWindowEvent, wrapper);
    }

    /* Convenience method to send an event to all windows in the group.
     *
     * @param event {obj} any object with a `type` property.
     * @param includeSelf {boolean} set false to exclude self from the groupcast.
     */
    groupcastEvent(event, includeSelf = true) {
        this.sendWindowEvent(null, event, includeSelf);
    }

    /* In addition to the above API methods, this class also dispatches
     * the following listenable events:
     *
     * updateMapping:
     *      Fired when the window mapping has been updated. This means the mapping
     *      from window numbers to peer names. Window numbers are positive integers,
     *      and applications should use them to number the windows for the user. They
     *      are also the `windowNumber` arguments to the API methods above.
     *
     *      Event format: {
     *          type: 'updateMapping',
     *          target: this WindowPeer,
     *          mapping: the new mapping, represented as an object of key-value pairs
     *      }
     *
     * disconnect:
     *      Fired if this WindowPeer becomes disconnected.
     *
     *      Event format: {
     *          type: 'disconnect',
     *          target: this WindowPeer
     *      }
     */

}
