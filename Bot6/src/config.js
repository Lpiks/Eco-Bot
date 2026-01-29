require('dotenv').config();

module.exports = {
    TARGET_URL: process.env.TARGET_URL || 'https://upshopdz.store/product/%d9%83%d8%a7%d8%a8%d9%84-%d8%b4%d8%a7%d8%ad%d9%86-%d9%88%d8%ad%d8%a7%d9%85%d9%84-%d8%ba%d9%8a%d8%b1-%d9%85%d8%b1%d8%a6%d9%8a-2-%d9%81%d9%8a-1/',
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
