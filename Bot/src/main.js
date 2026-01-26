const browserManager = require('./bot/browser');
const actionManager = require('./bot/actions');
const dataGenerator = require('./utils/dataGenerator');
const logger = require('./utils/logger');
const config = require('./config');

async function run() {
    try {
        const identity = dataGenerator.generateIdentity();
        logger.info('Generated Identity:', identity);

        const page = await browserManager.init();
        await actionManager.init(page);

        const targetUrl = config.TARGET_URL;
        await actionManager.navigate(targetUrl);

        if (await actionManager.checkForCaptcha(page)) {
            logger.warn('Security Trigger: Captcha or Rate Limit detected on load. Aborting.');
            await actionManager.takeScreenshot('security_trigger');
            return;
        }

        // --- Interaction Logic (The Happy Path) ---
        // Note: Selectors here are placeholders. In a real scenario, we inspect the page.
        // Assuming a standard Shopify checkout or landing page form.

        // 1. Full Name
        // Based on HTML: <input type="text" name="first_name" ...>
        const nameInput = 'input[name="first_name"]';
        if (await page.$(nameInput)) {
            await actionManager.typeHuman(nameInput, identity.fullName);
        } else {
            logger.warn('Name input (first_name) not found');
        }

        // 2. Phone
        const phoneSelectors = ['input[name="phone"]', 'input[type="tel"]', 'input[placeholder*="Phone"]'];
        let phoneInput = null;
        for (const sel of phoneSelectors) {
            if (await page.$(sel)) { phoneInput = sel; break; }
        }
        if (phoneInput) await actionManager.typeHuman(phoneInput, identity.phone);

        // 3. Wilaya (Dropdown)
        // Based on HTML: <select name="province" ...>
        const wilayaSelect = 'select[name="province"]';
        try {
            // value in HTML is like "30" or "01". identity.wilayaCode matches this.
            await actionManager.selectOption(wilayaSelect, identity.wilayaCode);
            logger.info(`Selected Wilaya: ${identity.wilaya} (Code: ${identity.wilayaCode})`);
        } catch (e) {
            logger.warn(`Wilaya selection failed for code ${identity.wilayaCode}: ${e.message}`);
        }

        // 4. Dynamic Wait for Commune
        // Based on HTML: <select name="city" ...>
        const communeSelect = 'select[name="city"]';
        try {
            // Wait for it to be enabled and have options (it likely depends on Province)
            await page.waitForFunction(
                (selector) => {
                    const el = document.querySelector(selector);
                    return el && !el.disabled && el.options.length > 1;
                },
                { timeout: 15000 },
                communeSelect
            );

            // The commune values are likely NOT just names. We might need to select by TEXT.
            // Our selectOption tries standard select (by value), then falls back to text search.
            // However, typical Shopify/Leadform apps often use ID or Name as value.
            // We should try to find the option that matches our 'identity.commune' text.

            await actionManager.selectOption(communeSelect, identity.commune);
            logger.info(`Selected Commune: ${identity.commune}`);
        } catch (e) {
            logger.warn('Commune wait/select failed. (Maybe commune name mismatch or timeout)');
        }

        // 5. Quantity (if applicable)
        // If there is a quantity input
        const qtyInput = 'input[name="quantity"]';
        if (await page.$(qtyInput)) {
            await page.$eval(qtyInput, el => el.value = ''); // Clear
            await actionManager.typeHuman(qtyInput, identity.quantity.toString());
        }

        // 6. Submit
        if (config.DRY_RUN) {
            logger.info('DRY RUN MODE: Skipping final submit click.');
        } else {
            // Based on HTML: button with class 'leadform-button' or text 'إشتري الان'
            const submitBtnSelector = 'button.leadform-button[type="submit"]';
            const btn = await page.$(submitBtnSelector);

            if (btn) {
                await btn.click();
                logger.info('Clicked Submit button.');
                await page.waitForNavigation({ timeout: 15000 }).catch(() => logger.warn('No navigation after submit (maybe AJAX success message)'));
            } else {
                logger.warn('Submit button not found.');
            }
        }

        logger.info('Run completed successfully.');

    } catch (error) {
        logger.error('Critical Error:', error);
        if (browserManager.page) {
            await actionManager.takeScreenshot('error_state');
        }
    } finally {
        await browserManager.close();
    }
}

if (require.main === module) {
    run();
}

module.exports = { run };
