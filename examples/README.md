# Examples

In order to build the examples you must [install the dev dependencies](https://docs.npmjs.com/cli/v6/commands/npm-install).
Then you can

    $ npm run build_examp

to build the examples.

In the notes below, we use `BROWSER_PEERS` to refer to the root directory of this project. 

## Covered Classes

At this time we only have a couple of examples, each demonstrating use of the `WindowPeer` class, since
this is one of the more involved parts of the library.

The second example supports `WindowPeer` using a browser extension, and therefore also serves as an example
of using a couple of our other classes, `PsCsPeer` and `PsBgsRelay`.

In the future we hope to add more basic examples demonstrating use of all the classes in the library.
For now, please see the doctext in the source code for all classes, for hints on how to use them.

------------------------------------------------------------------------------------

## Flask Window Group Example

This example demonstrates the use of a Flask web server to support a page that uses the `WindowPeer` class
to communicate between multiple browser tabs/windows.

### Usage

In `BROWSER_PEERS/examples/wgflask`, set up and activate a Python virtual environment. The example has been
tested with Python 3.8. Earlier versions back to 3.6 will also likely work, but have not been tested. If you
do not already have Python 3.8 accessible from the commandline, you might consider using [`pyenv`](https://github.com/pyenv/pyenv#installation).
If using `pyenv`, you may proceed as follows:

    $ pyenv shell 3.8.3
    $ python -m venv venv
    $ . venv/bin/activate
    $ pip install --upgrade pip
    $ pip install -r requirements.txt

(you only have to set it up once; thereafter, just activating with `. venv/bin/activate` is enough).
Then move to the build directory, and start up the webserver.

    (venv) $ cd ../../build/wgflask
    (venv) $ python app.py

By default the server will try to bind to port 5005. You may pass a different port on the command
line if you wish, e.g.:

    (venv) $ python app.py 5050

Then open up a web browser and navigate to `http://localhost:5005/` (or substitute the port number you chose).
Now try opening up one or two more browser tabs at the same address. Each tab should now state its own window
number, and you should be able to send messages to selected windows, by number.

When you're done testing, you can stop the web server with `Ctrl-C`.

### How it Works

You can examine `app.py` in the `BROWSER_PEERS/examples/wgflask` directory in order to see what is required on
the server side. For the client side, see `index.js` in this directory, as well as `peer_demo.js` and `demo_page.html`
under `BROWSER_PEERS/examples`.

------------------------------------------------------------------------------------

## Extension Window Group Example

This example demonstrates the use of a browser extension to support a page that uses the `WindowPeer` class
to communicate between multiple browser tabs/windows.

First you need to load the extension in your web browser:

#### In Firefox:

* Open a new tab and enter `about:debugging` in the address bar.
* Go to "This Firefox".
* Click "Load Temporary Add-on..."
* Find the `build/wgext/extension` directory, and select the `manifest.json` file.

#### In Chrome:

* Open a new tab and enter `chrome://extensions/` in the address bar.
* Click "Load unpacked".
* Find the `build/wgext/` directory, and select the `extension` directory.

Next you need to go to `build/wgex` and start a web server. For example, with Python you can do:

    $ python -m http.server

Finally, you can go back to your browser and load the page from `localhost`, via the appropriate port.
For example, if you used the simple Python server suggested above, you would navigate to `http://localhost:8000`.

Open this page in several tabs, and try sending messages between them.

When you're done experimenting, you can stop the web server (e.g. with `Ctrl-C`), and unload the temporary extension
from your browser:

#### In Firefox:

Find the "Window Group Demo Extension" under "Temporary Extensions" on the `about:debugging` page, and click
the `Remove` button.

#### In Chrome:

Find the "Window Group Demo Extension" on the `chrome://extensions/` page, and click the `Remove` button.

### How it Works

Examine all the files under `BROWSER_PEERS/examples/wgext/extension` to see how the browser extension is coded.
The page script is in `BROWSER_PEERS/examples/wgext/page.js`, and relies on
`BROWSER_PEERS/examples/peer_demo.js` just like the previous example.
Also the page you are viewing in the browser is `BROWSER_PEERS/examples/demo_page.html`, just as in the previous example.
