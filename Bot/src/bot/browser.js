const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const config = require('../config');
const logger = require('../utils/logger');

puppeteer.use(StealthPlugin());

class BrowserManager {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    async init() {
        logger.info('Launching browser...');
        this.browser = await puppeteer.launch({
            headless: config.HEADLESS,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--window-size=1366,768',
                '--disable-infobars',
                '--disable-extensions'
            ],
            defaultViewport: null // Allows explicit window size to take effect
        });

        this.page = await this.browser.newPage();

        // Enhance stealth
        await this.page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });
        });

        // Set realistic User Agent (could be randomized per run in a real scenario)
        await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        logger.info('Browser launched in stealth mode.');
        return this.page;
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            logger.info('Browser closed.');
        }
    }
}

module.exports = new BrowserManager();
