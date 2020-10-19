const path = require('path');

module.exports = env => {
    const devmode = !!(env||{}).dev;
    return {
        entry: {
            'test1': './src/test/test_page_01.js',
        },
        output: {
            path: path.resolve(__dirname, 'dist'),
            filename: pathData => {
                return pathData.chunk.name.startsWith('test') ? 'test/[name].js' : '[name].js';
            },
        },
        mode: devmode ? 'development' : 'production',
        devtool: devmode ? 'inline-source-map' : false,
    };
};
