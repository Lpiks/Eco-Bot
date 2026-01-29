const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const config = require('../config');
const logger = require('../utils/logger');

const fs = require('fs');
const path = require('path');

puppeteer.use(StealthPlugin());

class BrowserManager {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    getProxy() {
        try {
            const proxyPath = path.join(__dirname, '../../data/proxies.txt');
            if (fs.existsSync(proxyPath)) {
                const content = fs.readFileSync(proxyPath, 'utf8');
                const lines = content.split('\n')
                    .map(l => l.trim())
                    .filter(l => l && !l.startsWith('#'));

                if (lines.length > 0) {
                    return lines[Math.floor(Math.random() * lines.length)];
                }
            }
        } catch (error) {
            logger.warn('Failed to load proxies:', error.message);
        }
        return null;
    }

    async init() {
        logger.info('Launching browser...');

        // Randomize Viewport
        const width = Math.floor(Math.random() * (1440 - 1024 + 1)) + 1024;
        const height = Math.floor(Math.random() * (900 - 768 + 1)) + 768;

        const launchArgs = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            `--window-size=${width},${height}`,
            '--disable-infobars',
            '--disable-extensions'
        ];

        const proxy = this.getProxy();
        if (proxy) {
            // Check for auth in proxy string (user:pass@host:port)
            // Puppeteer needs --proxy-server=host:port and then page.authenticate
            let proxyUrl = proxy;
            let username, password;

            // Simple parsing for user:pass@ip:port
            if (proxy.includes('@')) {
                const parts = proxy.split('@');
                const auth = parts[0]; // user:pass
                proxyUrl = parts[1];   // ip:port
                [username, password] = auth.split(':');
            } else if (!proxy.startsWith('http')) {
                // assume ip:port if no protocol
                proxyUrl = proxy;
            }

            launchArgs.push(`--proxy-server=${proxyUrl}`);
            logger.info(`Using Proxy: ${proxyUrl} (Auth: ${!!username})`);

            this.browser = await puppeteer.launch({
                headless: config.HEADLESS,
                args: launchArgs,
                defaultViewport: null
            });

            this.page = await this.browser.newPage();

            if (username && password) {
                await this.page.authenticate({ username, password });
            }

        } else {
            logger.info('No proxy found or proxies.txt is empty. Using direct connection.');
            this.browser = await puppeteer.launch({
                headless: config.HEADLESS,
                args: launchArgs,
                defaultViewport: null
            });
            this.page = await this.browser.newPage();
        }

        // Enhance stealth
        await this.page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });
        });

        // Random User Agent
        const UserAgent = require('user-agents');
        const userAgent = new UserAgent({ deviceCategory: 'desktop' }).toString();
        await this.page.setUserAgent(userAgent);

        // Set Viewport explicitly to match window (sometimes needed)
        await this.page.setViewport({ width, height });

        logger.info(`Browser launched. UA: ${userAgent}, Viewport: ${width}x${height}`);
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
