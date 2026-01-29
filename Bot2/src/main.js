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

        // --- Interaction Logic (LeadForm) ---

        // Wait for potential container (either ID or class)
        try {
            await page.waitForFunction(
                () => document.querySelector('#leadform-embedded-container') || document.querySelector('form.leadform-form'),
                { timeout: 15000 }
            );
        } catch (e) {
            logger.warn('LeadForm container not found immediately.');
        }

        // 1. Full Name
        const nameInput = 'input[name="first_name"]';
        if (await page.$(nameInput)) {
            await actionManager.typeHuman(nameInput, identity.fullName);
        } else {
            logger.warn('Name input (first_name) not found');
        }

        // 2. Phone
        const phoneInput = 'input[name="phone"]';
        if (await page.$(phoneInput)) {
            await actionManager.typeHuman(phoneInput, identity.phone);
        } else {
            logger.warn('Phone input (phone) not found');
        }

        // 3. Wilaya (Select by Value - Code)
        const wilayaSelect = 'select[name="province"]';
        try {
            await page.waitForSelector(wilayaSelect, { visible: true });
            const wilayaCode = parseInt(identity.wilayaCode).toString().padStart(2, '0'); // Ensure "01" format if needed, but HTML shows "01", "16" etc.

            // Check HTML structure: <option value="01">01 Adrar</option>
            const targetValue = await page.$eval(wilayaSelect, (select, code) => {
                const options = Array.from(select.options);
                // Try exact match on value first
                const option = options.find(opt => opt.value === code || opt.value === parseInt(code).toString());
                return option ? option.value : null;
            }, wilayaCode);

            if (targetValue) {
                await page.select(wilayaSelect, targetValue);
                logger.info(`Selected Wilaya: ${identity.wilaya} (Value: ${targetValue})`);
            } else {
                logger.warn(`Wilaya option for code ${wilayaCode} not found.`);
            }
        } catch (e) {
            logger.warn(`Wilaya selection failed: ${e.message}`);
        }

        // 4. Commune (City) - Wait for load then Select by Text
        const communeSelect = 'select[name="city"]';
        try {
            // Wait for options to populate (length > 1 means cities loaded)
            await page.waitForFunction(
                (selector) => {
                    const el = document.querySelector(selector);
                    return el && !el.disabled && el.options.length > 1;
                },
                { timeout: 15000 },
                communeSelect
            );

            const communeName = identity.commune;
            // Try partial text match
            const communeValue = await page.$eval(communeSelect, (select, name) => {
                const options = Array.from(select.options);
                const option = options.find(opt => opt.text.includes(name) || name.includes(opt.text));
                return option ? option.value : null;
            }, communeName);

            if (communeValue) {
                await page.select(communeSelect, communeValue);
                logger.info(`Selected Commune: ${communeName} (Value: ${communeValue})`);
            } else {
                logger.warn(`Commune '${communeName}' not found. Selecting random available option.`);
                const randomValue = await page.$eval(communeSelect, select => {
                    if (select.options.length > 1) {
                        const idx = Math.floor(Math.random() * (select.options.length - 1)) + 1;
                        return select.options[idx].value;
                    }
                    return null;
                });
                if (randomValue) {
                    await page.select(communeSelect, randomValue);
                    logger.info(`Selected Random Commune Value: ${randomValue}`);
                }
            }
        } catch (e) {
            logger.warn(`Commune wait/select failed: ${e.message}`);
        }

        // 5. Quantity (Default is 1, skipping bundle selection for now)
        // If needed, we can click .lfcod-bundle-item

        // 6. Submit
        if (config.DRY_RUN) {
            logger.info('DRY RUN MODE: Skipping final submit click.');
        } else {
            const submitBtnSelector = 'button.leadform-button[type="submit"]';
            const btn = await page.$(submitBtnSelector);

            if (btn) {
                await btn.click();
                logger.info('Clicked Submit button.');

                try {
                    // Try waiting for navigation or success message
                    await page.waitForNavigation({ timeout: 15000, waitUntil: 'networkidle0' });
                } catch (e) {
                    logger.warn('No navigation detected after submit (could be SPA or error).');
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
            // Delay between 1 minute (60000ms) and 5 minutes (300000ms)
            const minDelay = 60000;
            const maxDelay = 300000;
            const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

            const delayInMinutes = (delay / 60000).toFixed(2);
            logger.info(`Waiting ${delay}ms (~${delayInMinutes} minutes) before next iteration...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    logger.info('All iterations completed. Shutting down.');
}

if (require.main === module) {
    run();
}

module.exports = { run };
