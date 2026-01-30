const browserManager = require('./bot/browser');
const actionManager = require('./bot/actions');
const dataGenerator = require('./utils/dataGenerator');
const logger = require('./utils/logger');
const config = require('./config');
const fs = require('fs');
const path = require('path');

async function logClientData(identity, iteration) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] Iteration ${iteration}: Name: ${identity.fullName}, Phone: ${identity.phone}, Wilaya: ${identity.wilaya} (${identity.wilayaCode}), Commune: ${identity.commune}, Qty: ${identity.quantity}\n`;
    const logPath = path.join(__dirname, '../logs/clients.txt');

    try {
        fs.appendFileSync(logPath, logEntry);
        logger.info(`Client data logged to ${logPath}`);
    } catch (err) {
        logger.error(`Failed to log client data: ${err.message}`);
    }
}

async function processOrder(iteration) {
    logger.info(`--- Starting Iteration ${iteration} ---`);
    try {
        const identity = dataGenerator.generateIdentity();
        logger.info('Generated Identity:', identity);

        // Log the generated client data immediately
        await logClientData(identity, iteration);

        const page = await browserManager.init();
        await actionManager.init(page);

        const targetUrl = config.TARGET_URL;
        await actionManager.navigate(targetUrl);

        if (await actionManager.checkForCaptcha(page)) {
            logger.warn('Security Trigger: Captcha or Rate Limit detected on load. Aborting this iteration.');
            await actionManager.takeScreenshot(`security_trigger_${iteration}`);
            return;
        }

        // --- Warm Up (Human Behavior) ---
        logger.info('Warming up profile...');
        try {
            // Random mouse moves
            for (let k = 0; k < 3; k++) {
                await page.mouse.move(
                    Math.floor(Math.random() * 500),
                    Math.floor(Math.random() * 500)
                );
                await new Promise(r => setTimeout(r, Math.random() * 1000 + 500));
            }
            // Small scroll
            await page.evaluate(() => {
                window.scrollBy(0, window.innerHeight * Math.random());
            });
            await new Promise(r => setTimeout(r, Math.random() * 2000 + 1000));
        } catch (e) {
            logger.warn('Warm up deviation:', e);
        }

        // --- Interaction Logic (JustSell Variant) ---

        // 1. Full Name
        const nameInput = 'input#userName';
        if (await page.$(nameInput)) {
            await actionManager.typeHuman(nameInput, identity.fullName);
        } else {
            logger.warn('Name input (#userName) not found');
        }

        // 2. Phone
        const phoneInput = 'input#userPhone';
        if (await page.$(phoneInput)) {
            await actionManager.typeHuman(phoneInput, identity.phone);
        } else {
            logger.warn('Phone input (#userPhone) not found');
        }

        // 3. Wilaya (Dropdown) - Values like "01|Adrar"
        const wilayaSelect = 'select#userCity';
        try {
            if (await page.$(wilayaSelect)) {
                const wilayaCode = identity.wilayaCode; // e.g. "01" or "16"

                // Find option that starts with code + "|"
                const targetValue = await page.$eval(wilayaSelect, (select, code) => {
                    const options = Array.from(select.options);
                    // Match "01|Adrar" or "1|Adrar" (handle leading zero if needed, though identity usually has it)
                    // The HTML shows "01|Adrar", "16|Alger"
                    const option = options.find(opt => opt.value.startsWith(code + '|') || opt.value === code);
                    return option ? option.value : null;
                }, wilayaCode);

                if (targetValue) {
                    await actionManager.selectOption(wilayaSelect, targetValue);
                    logger.info(`Selected Wilaya: ${identity.wilaya} (Value: ${targetValue})`);

                    // Wait for Commune dropdown to populate
                    await new Promise(r => setTimeout(r, 1000));
                } else {
                    logger.warn(`Wilaya option for code ${wilayaCode} not found.`);
                }
            } else {
                logger.warn('Wilaya select (#userCity) not found');
            }
        } catch (e) {
            logger.warn(`Wilaya selection failed: ${e.message}`);
        }

        // 4. Commune (Dropdown)
        const communeSelect = 'select#userState';
        try {
            if (await page.$(communeSelect)) {
                await page.waitForFunction(
                    (selector) => {
                        const el = document.querySelector(selector);
                        return el && !el.disabled && el.options.length > 1;
                    },
                    { timeout: 10000 },
                    communeSelect
                );

                const communeName = identity.commune;
                const communeValue = await page.$eval(communeSelect, (select, name) => {
                    const options = Array.from(select.options);
                    const option = options.find(opt => opt.text.toUpperCase().includes(name.toUpperCase()));
                    return option ? option.value : null;
                }, communeName);

                if (communeValue) {
                    await actionManager.selectOption(communeSelect, communeValue);
                    logger.info(`Selected Commune: ${communeName} (Value: ${communeValue})`);
                } else {
                    logger.warn(`Commune '${communeName}' not found. Selecting random.`);
                    await page.$eval(communeSelect, select => {
                        if (select.options.length > 1) {
                            const idx = Math.floor(Math.random() * (select.options.length - 1)) + 1;
                            select.selectedIndex = idx;
                        }
                    });
                }
            } else {
                logger.warn('Commune select (#userState) not found');
            }
        } catch (e) {
            logger.warn(`Commune wait/select failed: ${e.message}`);
        }

        // 5. Quantity (Not explicitly in new HTML, but likely present or hidden. Leaving as placeholder check)
        // The HTML doesn't show a quantity input, so we might skip or check if it exists differently.
        // Keeping basic check just in case.
        const qtyInput = '#quantity';
        if (await page.$(qtyInput)) {
            await page.$eval(qtyInput, el => el.value = '');
            await actionManager.typeHuman(qtyInput, identity.quantity.toString());
        }

        // 6. Submit
        if (config.DRY_RUN) {
            logger.info('DRY RUN MODE: Skipping final submit click.');
        } else {
            const submitBtnSelector = 'button[type="submit"]';
            const btn = await page.$(submitBtnSelector);

            if (btn) {
                await btn.click();
                logger.info('Clicked Submit button.');
                try {
                    await page.waitForNavigation({ timeout: 15000, waitUntil: 'networkidle0' });
                } catch (e) {
                    logger.warn('No navigation detected. Checking for success message or validation errors.');
                }
            } else {
                logger.warn('Submit button not found.');
            }
        }

        logger.info(`Iteration ${iteration} completed successfully.`);

    } catch (error) {
        logger.error(`Critical Error in Iteration ${iteration}:`, error);
        if (browserManager.page) {
            await actionManager.takeScreenshot(`error_state_${iteration}`);
        }
    } finally {
        await browserManager.close();
    }
}

async function run() {
    const LOOP_COUNT = 20;
    logger.info(`Starting Bot Run: ${LOOP_COUNT} iterations scheduled.`);

    for (let i = 1; i <= LOOP_COUNT; i++) {
        await processOrder(i);

        if (i < LOOP_COUNT) {
            // Random delay between 1 min (60000ms) and 3 mins (180000ms)
            const minDelay = 60000;
            const maxDelay = 180000;
            const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

            const minutes = Math.floor(delay / 60000);
            const seconds = Math.floor((delay % 60000) / 1000);
            logger.info(`Waiting ${minutes}m ${seconds}s before next iteration...`);

            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    logger.info('All iterations completed. Shutting down.');
}

if (require.main === module) {
    run();
}

module.exports = { run };
