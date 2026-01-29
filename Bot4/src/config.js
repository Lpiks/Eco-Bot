require('dotenv').config();

module.exports = {
    TARGET_URL: process.env.TARGET_URL || 'https://callidy-market.myecomsite.net/cable',
    HEADLESS: process.env.HEADLESS === 'true',
    DRY_RUN: process.env.DRY_RUN === 'true',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    TIMEOUTS: {
        NAVIGATION: 60000,
        ELEMENT: 10000,
        TYPING_MIN: 50,
        TYPING_MAX: 150
    }
};
