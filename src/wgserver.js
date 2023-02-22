/*! browser-peers v0.2.1 | Copyright (c) 2020-2023 Steve Kieffer | MIT license */
/* SPDX-License-Identifier: MIT */

import {CsBgsPeer} from "./csbgspeer";


/* By instantiating a WindowGroupServer in the background script of
 * a browser extension, you can make the extension support the window
 * group protocol required by our WindowPeer class. In that case you
 * should use an ExtensionTransport with the WindowPeer.
 */
export class WindowGroupServer extends CsBgsPeer {

    constructor(name, options) {
        super(name);
        const {
            eventNamePrefix = '',
        } = options || {};
        this.eventNamePrefix = eventNamePrefix;
        const handlerNames = [
            'join',
            'depart',
            'welcome',
            'postWindowMessage',
            'sendWindowEvent',
        ];
        for (let name of handlerNames) {
            this._addBuiltInHandler(eventNamePrefix + name, this[name].bind(this));
        }
        this.windowGroupId = 'windowGroup';
    }

    /*
     * Broadcast or make a request, depending on whether the recipient is resp. is not
     * equal to our windowGroupId. In both cases, ready checks are skipped.
     */
    variableRequest(recipient, handlerDescrip, args, includeSelf) {
        if (recipient === this.windowGroupId) {
            this.broadcastRequest(handlerDescrip, args, {
                skipReadyChecks: true,
                excludeSelf: !includeSelf,
            });
        } else {
            this.makeRequest(recipient, handlerDescrip, args);
        }
    }

    join({birthday}, meta) {
        this.broadcastRequest(this.eventNamePrefix + 'hello', {
            windowGroupId: this.windowGroupId,
            name: meta.from,
            birthday: birthday,
        }, {
            skipReadyChecks: true,
        });
    }

    depart(msg, meta) {
        this.broadcastRequest(
            this.eventNamePrefix + 'observeDeparture',
            {name: meta.from}, {skipReadyChecks: true,}
        );
    }

    welcome(msg) {
        this.makeRequest(msg.to, this.eventNamePrefix + 'welcome', msg);
    }

    postWindowMessage(msg) {
        this.variableRequest(msg.room, this.eventNamePrefix + 'handleWindowMessage', msg);
    }

    sendWindowEvent(msg) {
        const includeSelf = (msg.includeSelf !== false); // i.e. accept any boolean, but default to `true` if undefined.
        this.variableRequest(msg.room, this.eventNamePrefix + 'genericWindowEvent', msg.event, includeSelf);
    }

}
