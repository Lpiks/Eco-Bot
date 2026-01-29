const { createCursor } = require('ghost-cursor');
const config = require('../config');
const logger = require('../utils/logger');

class ActionManager {
    constructor() {
        this.cursor = null;
    }

    async init(page) {
        this.page = page;
        this.cursor = createCursor(page);
        logger.info('Ghost cursor initialized.');
    }

    async navigate(url) {
        logger.info(`Navigating to ${url}...`);
        await this.page.goto(url, { waitUntil: 'networkidle2', timeout: config.TIMEOUTS.NAVIGATION });
    }

    async typeHuman(selector, text) {
        logger.info(`Typing "${text}" into ${selector}`);
        try {
            await this.cursor.click(selector);
            // Random typing delay is handled by puppeteer usually, but we can enforce it.
            // Ghost cursor handles movement, plain puppeteer type handles typing.
            // We can add random delays.
            for (const char of text) {
                await this.page.type(selector, char);
                await new Promise(r => setTimeout(r, Math.random() * (config.TIMEOUTS.TYPING_MAX - config.TIMEOUTS.TYPING_MIN) + config.TIMEOUTS.TYPING_MIN));
            }
        } catch (error) {
            logger.error(`Failed to type in ${selector}: ${error.message}`);
            throw error;
        }
    }

    async selectOption(selector, textToSelect) {
        logger.info(`Selecting "${textToSelect}" from ${selector}`);
        // This is tricky for custom dropdowns vs native selects.
        // Assuming standard select for now or clickable UI.
        // If it's a semantic select (native), we use page.select.
        // If it's a div-based select, we click and then click the option.

        // Strategy: Try standard select first.
        try {
            await this.page.select(selector, textToSelect); // This usually takes the 'value', not text.
            // If we only have text, we need to find the value first.
            const optionValue = await this.page.$eval(`${selector} option`, (opts, text) => {
                const found = Array.from(opts).find(o => o.text.includes(text) || o.value === text);
                return found ? found.value : null;
            }, textToSelect);

            if (optionValue) {
                await this.page.select(selector, optionValue);
            } else {
                throw new Error('Option not found by text');
            }

        } catch (e) {
            // Fallback: Click logic for non-standard dropdowns
            logger.warn(`Standard select failed, trying click interaction for ${selector}`);
            await this.cursor.click(selector);
            // Wait for dropdown
            // This part is highly page-dependent.
            // For now, let's assume standard behavior or add specific logic later.
        }
    }

    async checkForHoneypot(page) {
        // Check for common hidden fields that might be honeypots
        // If a field is hidden (display:none, visibility:hidden) and we interact with it, we get flagged.
        // We should just ensure we DO NOT interact with them.
        // But here we can check if we accidentally triggered something or if there are trapping elements.
        // For a stress test, we mainly want to avoid filling them.
        // This function could return true if a "trap" is detected on page load (e.g. analysis).
        return false;
    }

    async checkForCaptcha(page) {
        // Check for common captcha iframes or elements
        const captchaSelectors = [
            'iframe[src*="recaptcha"]',
            'iframe[src*="hcaptcha"]',
            '#g-recaptcha-response',
            '.g-recaptcha'
        ];

        for (const sel of captchaSelectors) {
            if (await page.$(sel)) {
                logger.warn(`Potential Captcha detected: ${sel}`);
                return true;
            }
        }

        // Check for 429 error in text - Be more specific
        // generic '429' is too broad (could be price).
        const title = await page.title();
        const content = await page.content();

        if (title.includes('429') || content.includes('Too Many Requests')) {
            logger.warn('Rate limit (429) detected in page title or "Too Many Requests" text.');
            return true;
        }

        return false;
    }

    // Semantic selector helper: Find input by label text
    async getInputByLabel(labelText) {
        // XPath to find input associated with a label containing text
        const [element] = await this.page.$x(`//label[contains(text(), '${labelText}')]/following-sibling::input | //label[contains(text(), '${labelText}')]/../input`);
        return element;
    }

    async takeScreenshot(name) {
        const filepath = `logs/${name}_${Date.now()}.png`;
        await this.page.screenshot({ path: filepath, fullPage: true });
        logger.info(`Screenshot saved: ${filepath}`);
    }
}

module.exports = new ActionManager();
