module.exports = {
    "extends": [
        "airbnb-base",
        "plugin:security/recommended"
    ],
    "rules": {
        "no-unused-vars": ["error", { "argsIgnorePattern": "next" }],
        "indent": [2, 4],
        "linebreak-style": 0,
        'max-len':  ["error", { "code": 140 }],
    },
    "plugins": [
        "security"
    ],
    "env": {
        node: true,
        mocha: true
    }
};
