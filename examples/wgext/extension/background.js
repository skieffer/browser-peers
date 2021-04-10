import {WindowGroupServer} from "../../../src/wgserver";

const wgs = new WindowGroupServer('myWindowGroupServer', {
    eventNamePrefix: 'myWindowPeersPrefix',
});
wgs.setReady();
