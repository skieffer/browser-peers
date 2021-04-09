const path = require('path');
const CopyWebpackPlugin = require("copy-webpack-plugin");

module.exports = env => {
    return {
        entry: {
            'wgflask': './examples/wgflask/index.js',
        },
        output: {
            path: path.resolve(__dirname, 'build'),
            filename: pathData => {
                return {
                    wgflask: 'wgflask/static/index.js',
                }[pathData.chunk.name];
            },
        },
        mode: 'development',
        devtool: 'inline-source-map',
        plugins: [
            new CopyWebpackPlugin({
                patterns:[
                    {
                        context: "examples/wgflask",
                        from: "app.py",
                        to: "wgflask/app.py"
                    },
                    {
                        context: "examples/wgflask",
                        from: "templates",
                        to: "wgflask/templates"
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
