const path = require('path');
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = env => {
    return {
        entry: {
            'wgflask': './examples/wgflask/index.js',
            'wgext_bg': './examples/wgext/extension/background.js',
            'wgext_ct': './examples/wgext/extension/content.js',
            'wgext_pg': './examples/wgext/page.js',
        },
        output: {
            path: path.resolve(__dirname, 'build'),
            filename: pathData => {
                return {
                    wgflask: 'wgflask/static/index.js',
                    wgext_bg: 'wgext/extension/background.js',
                    wgext_ct: 'wgext/extension/content.js',
                    wgext_pg: 'wgext/static/index.js',
                }[pathData.chunk.name];
            },
        },
        mode: 'development',
        devtool: 'inline-source-map',
        plugins: [
            new CopyWebpackPlugin({
                patterns:[
                    // wgext
                    {
                        context: "examples/wgext/extension",
                        from: "manifest.json",
                        to: "wgext/extension/manifest.json",
                    },
                    {
                        context: "examples",
                        from: "demo_page.html",
                        to: "wgext/index.html"
                    },
                    // wgflask
                    {
                        context: "examples/wgflask",
                        from: "app.py",
                        to: "wgflask/app.py"
                    },
                    {
                        context: "examples",
                        from: "demo_page.html",
                        to: "wgflask/templates/index.html"
                    },
                    {
                        context: "examples/wgflask",
                        from: ".flaskenv",
                        to: "wgflask/.flaskenv",
                        toType: "file",
                    },
                ],
            }),
        ],
    };
};
