from uuid import uuid4

from flask import Flask, render_template, request, session, jsonify
from flask_socketio import SocketIO, emit, disconnect, join_room, leave_room, close_room
from flask_socketio import rooms as get_current_rooms

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, async_mode=None)

# ------------------------------------------------------------------------
# Page loaders

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/proto1')
def proto1():
    return render_template('proto1.html')

# ------------------------------------------------------------------------
# HTTP handlers for our protocol

NAMESPACE = '/socketPeers'

@app.route('/joinSessionWindowGroup')
def joinSessionWindowGroup():
    sid = request.args['sid']
    windowGroupId = session.get('windowGroupId')
    if windowGroupId is None:
        windowGroupId = str(uuid4())
        session['windowGroupId'] = windowGroupId
    join_room(windowGroupId, sid=sid, namespace=NAMESPACE)
    response = {
        "windowGroupId": windowGroupId,
        "sid": sid,
    }
    socketio.emit('addNewWindowToGroup', response, namespace=NAMESPACE, room=windowGroupId)
    return jsonify(response)

# ------------------------------------------------------------------------
# Socket handlers for our protocol

@socketio.on('disconnect', namespace=NAMESPACE)
def test_disconnect():
    sid = request.sid
    print('Client disconnected', sid)
    discon_room_name = f'{sid}-discon'
    emit('windowDisconnected', {'sid': sid}, namespace=NAMESPACE, room=discon_room_name)
    close_room(discon_room_name, namespace=NAMESPACE)

@socketio.on('disconnectRequest', namespace=NAMESPACE)
def disconnect_request(message):
    print('Client requested disconnect', request.sid)
    disconnect()

@socketio.on('publishWindowGroupMapping', namespace=NAMESPACE)
def publishWindowGroupMapping(msg):
    """
    msg format: {
        mapping: {dict} the mapping dict to be published
        room: {string} name of room to which to publish the mapping
    }

    Besides publishing the mapping as the name of the event suggests, we
    also maintain the "disconnect rooms" for all SIDs given as values of
    the mapping.
    """
    mapping = msg["mapping"]
    maintainDisconnectRooms(list(mapping.values()))
    emit('updateWindowGroupMapping', mapping, room=msg["room"])

@socketio.on('makeWindowRequest', namespace=NAMESPACE)
def makeWindowRequest(msg):
    """
    msg format: {
        seqNum {int} as usual for requests that expect a 'success' response,
        dstWindowSid {string} the sid of the destination window,
        handlerDescrip {string} description of desired request handler to be
            invoked in the other window
        payload {any} the message intended for the destination window's
            `handleWindowRequest` socket event handler
    }
    """
    msg["srcWindowSid"] = request.sid
    emit('handleWindowRequest', msg, room=msg["dstWindowSid"])

@socketio.on('respondToWindowRequest', namespace=NAMESPACE)
def respondToWindowRequest(msg):
    """
    This function is the companion to the `makeWindowRequest` function.
    We expect the same seqNum to be returned, as well as the same
    srcWindowSid.

    msg format: {
        seqNum {int} the same sequence number that was given in the call
            to `makeWindowRequest` to which this is the answer.
        srcWindowSid {string} the sid of the window to which we are responding.
        result {any|optional} the message to be returned as answer in case of success;
        rejection_reason {any|optional} a rejection to be returned as error instead
           of a success result.
    }
    """
    srcWindowSid = msg["srcWindowSid"]
    if msg["result"]:
        emit("success", msg, room=srcWindowSid)
    else:
        emit("error", msg, room=srcWindowSid)

# ------------------------------------------------------------------------
# Supporting functions

def maintainDisconnectRooms(sids):
    """
    Given a list of SIDs, we ensure that each SID has a "disconnect room" named
    after it, and that every SID in the list belongs to every such room, and to
    no others, i.e. to no disconnect rooms not corresponding to the list.

    A "disconnect room" is simply a room named f'{SID}-discon'. The purpose of
    keeping each client in each such room is that, whenever any client is
    disconnected, we have a way of notifying all the others about it.
    """
    for sid in sids:
        # Prune
        current_rooms = get_current_rooms(sid, namespace=NAMESPACE)
        for r in current_rooms:
            if r[-7:] == '-discon' and r[:-7] not in sids:
                leave_room(r, sid, namespace=NAMESPACE)
        # Add
        for tid in sids:
            name = f'{tid}-discon'
            if tid != sid and name not in current_rooms:
                join_room(name, sid, namespace=NAMESPACE)

# ------------------------------------------------------------------------

if __name__ == '__main__':
    socketio.run(app)

