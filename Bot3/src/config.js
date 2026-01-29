require('dotenv').config();

module.exports = {
    TARGET_URL: process.env.TARGET_URL || 'https://sellinghub.org/products/%F0%9F%94%8C-%D9%83%D8%A7%D8%A8%D9%84-%D8%B4%D8%AD%D9%86-%D8%B3%D8%B1%D9%8A%D8%B9-%F0%9F%94%8B-%D8%AD%D8%A7%D9%85%D9%84-%D9%87%D8%A7%D8%AA%D9%81-%D9%82%D8%A7%D8%A8%D9%84-%D9%84%D9%84%D8%B7%D9%8A-%F0%9F%93%B1-%D8%B1%D8%A3%D8%B3-%D8%A7%D9%84%D8%B4%D8%AD%D9%86',
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
