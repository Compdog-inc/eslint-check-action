module.exports = {
    presets: [
        '@babel/preset-typescript', [
            '@babel/preset-env',
            {
                targets: {
                    node: 16,
                },
            },
        ],
    ],
    plugins: [
        '@babel/proposal-class-properties',
        '@babel/proposal-object-rest-spread',
    ],
};