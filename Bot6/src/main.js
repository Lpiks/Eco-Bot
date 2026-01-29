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

        // --- Interaction Logic (WooCommerce / CodPlugin) ---

        // 1. Full Name
        const nameInput = 'input[name="full_name"]';
        if (await page.$(nameInput)) {
            await actionManager.typeHuman(nameInput, identity.fullName);
        } else {
            logger.warn('Name input (full_name) not found');
        }

        // 2. Phone
        const phoneInput = 'input[name="phone_number"]';
        if (await page.$(phoneInput)) {
            // Ensure leading '0' just in case, though format usually standard
            const phone = identity.phone.startsWith('0') ? identity.phone : '0' + identity.phone;
            await actionManager.typeHuman(phoneInput, phone);
        } else {
            logger.warn('Phone input (phone_number) not found');
        }

        // 3. Wilaya (Native Select)
        const wilayaSelect = 'select[name="codplugin_state"]';
        if (await page.$(wilayaSelect)) {
            try {
                const wilayaCode = identity.wilayaCode.toString().padStart(2, '0'); // e.g. "01"

                // Find option value that matches "DZ-01" pattern or similar
                const targetValue = await page.$eval(wilayaSelect, (select, code) => {
                    const options = Array.from(select.options);
                    // Match value "DZ-01" or text containing the code/name
                    const option = options.find(opt =>
                        opt.value === `DZ-${code}` ||
                        opt.text.includes(`${code} `) ||
                        opt.text.startsWith(code)
                    );
                    return option ? option.value : null;
                }, wilayaCode);

                if (targetValue) {
                    await page.select(wilayaSelect, targetValue);
                    logger.info(`Selected Wilaya: ${targetValue}`);
                } else {
                    logger.warn(`Specific Wilaya code ${wilayaCode} not found. Selecting Random...`);
                    // Random selection excluding the placeholder (usually index 0)
                    await page.$eval(wilayaSelect, select => {
                        const count = select.options.length;
                        if (count > 1) {
                            select.selectedIndex = Math.floor(Math.random() * (count - 1)) + 1;
                            select.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    });
                }
                await new Promise(r => setTimeout(r, 1000)); // Wait for AJAX to load communes
            } catch (e) {
                logger.warn(`Wilaya selection failed: ${e.message}`);
            }
        } else {
            logger.warn('Wilaya select (codplugin_state) not found');
        }

        // 4. Commune (Native Select - Wait for population)
        const communeSelect = 'select[name="codplugin_city"]';
        if (await page.$(communeSelect)) {
            try {
                // Wait for options to populate (length > 1)
                await page.waitForFunction(
                    (selector) => {
                        const el = document.querySelector(selector);
                        return el && el.options.length > 1;
                    },
                    { timeout: 10000 },
                    communeSelect
                );

                // Select a random commune (safe bet as mapping names is hard without exact list)
                // Or try to fuzzy match if we really wanted to
                await page.$eval(communeSelect, select => {
                    const count = select.options.length;
                    if (count > 1) {
                        // Pick random index from 1 to count-1
                        const idx = Math.floor(Math.random() * (count - 1)) + 1;
                        select.selectedIndex = idx;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                });
                logger.info('Selected Random Commune.');
            } catch (e) {
                logger.warn('Commune selection failed (or timed out waiting for options):', e.message);
            }
        } else {
            logger.warn('Commune select (codplugin_city) not found');
        }

        // 5. Quantity / Product Variation (Radio)
        // Usually handled by default selection, but we can ensure one is checked
        // If there's a quantity counter:
        /*
        const qtyAddBtn = '#codplugin_add_button';
        if (await page.$(qtyAddBtn)) {
             // Logic to click add button based on identity.quantity
        }
        */

        // 6. Submit
        if (config.DRY_RUN) {
            logger.info('DRY RUN MODE: Skipping final submit click.');
        } else {
            try {
                const submitSelector = 'input[name="codplugin-submit"]';
                const submitBtn = await page.$(submitSelector);

                if (submitBtn) {
                    await page.evaluate(el => el.scrollIntoView(), submitBtn);
                    await new Promise(r => setTimeout(r, 500));

                    await submitBtn.click();
                    logger.info('Clicked Submit button.');

                    // Wait for success navigation
                    try {
                        await page.waitForNavigation({ timeout: 15000, waitUntil: 'networkidle0' });
                    } catch (navErr) {
                        logger.info('Navigation timeout. Checking for success URL/Element.');
                    }
                } else {
                    logger.warn('Submit button not found.');
                    await actionManager.takeScreenshot(`missing_submit_btn_${iteration}`);
                }
            } catch (e) {
                logger.warn(`Submit failed: ${e.message}`);
                await actionManager.takeScreenshot(`submit_error_${iteration}`);
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
    const LOOP_COUNT = 30;
    logger.info(`Starting Bot Run: ${LOOP_COUNT} iterations scheduled.`);

    for (let i = 1; i <= LOOP_COUNT; i++) {
        await processOrder(i);

        if (i < LOOP_COUNT) {
            // Random delay between 1 and 5 minutes (60000ms to 300000ms)
            const delay = Math.floor(Math.random() * (300000 - 60000 + 1)) + 60000;
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
