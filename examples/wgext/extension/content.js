import {PsCsPeer} from "../../../src/pscspeer";
import {PsBgsRelay} from "../../../src/psbgsrelay";

// Make a unique name for the window:
const windowName = `demoWindow-@(${(new Date()).toISOString()})-${Math.random()}`;

// Note that the peer name we pass to the relay must be that of the WindowGroupServer defined in background.js:
const windowRelay = new PsBgsRelay('myWindowGroupServer', windowName, 'wg-demo-ext');
windowRelay.connect();

// Make a peer for page scripts to talk to.
// It only needs one request handler, namely a method for page scripts to request the unique name this
// window has been assigned. Page scripts can then use this window name in order to contact the window
// group server running in the background, via the relay we defined above.
const gateway = new PsCsPeer('gateway', 'wg-demo-ext')
    .addHandler("get-window-name", () => windowName)
;
gateway.setReady();
