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

        // --- Interaction Logic (Hanotify) ---

        // 1. Full Name
        const nameInput = '#product-checkout__full-name__input';
        try {
            await page.waitForSelector(nameInput, { timeout: 10000, visible: true });
            await actionManager.typeHuman(nameInput, identity.fullName);
        } catch (e) {
            logger.warn('Name input not found or not visible');
        }

        // 2. Phone
        const phoneInput = '#product-checkout__phone-number_1__input';
        if (await page.$(phoneInput)) {
            await actionManager.typeHuman(phoneInput, identity.phone);
        } else {
            logger.warn('Phone input not found');
        }

        // 3. Wilaya (State) - Select by Value (Code)
        const wilayaSelect = '#product__checkout_state-select';
        try {
            const wilayaCode = parseInt(identity.wilayaCode).toString(); // Convert "01" to "1"
            await page.waitForSelector(wilayaSelect, { visible: true });

            // Find option with value == wilayaCode
            const targetValue = await page.$eval(wilayaSelect, (select, code) => {
                const options = Array.from(select.options);
                const option = options.find(opt => opt.value === code);
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
        const communeSelect = '#product__checkout_city-select';
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
                // HTML logic splits by '-', we just look for inclusion of our commune name
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

        // 5. Quantity (Click Button)
        if (identity.quantity > 1) {
            const plusBtnSelector = '#product__plus';
            try {
                const plusBtn = await page.$(plusBtnSelector);
                if (plusBtn) {
                    const clicksNeeded = identity.quantity - 1;
                    logger.info(`Increasing quantity to ${identity.quantity} (clicking + ${clicksNeeded} times)`);
                    for (let q = 0; q < clicksNeeded; q++) {
                        await plusBtn.click();
                        await new Promise(r => setTimeout(r, 200 + Math.random() * 200));
                    }
                } else {
                    logger.warn('Quantity plus button not found');
                }
            } catch (e) {
                logger.warn(`Quantity adjustment failed: ${e.message}`);
            }
        }

        // 6. Submit
        if (config.DRY_RUN) {
            logger.info('DRY RUN MODE: Skipping final submit click.');
        } else {
            const submitBtnSelector = '#product__checkout__button_1';
            const btn = await page.$(submitBtnSelector);

            if (btn) {
                // Ensure button is not disabled (logic in HTML disables it initially)
                await page.waitForFunction(
                    selector => !document.querySelector(selector).classList.contains('disabled'),
                    { timeout: 5000 },
                    submitBtnSelector
                ).catch(() => logger.warn('Submit button remained disabled or timeout'));

                await btn.click();
                logger.info('Clicked Submit button.');

                // Detection of success could be url change or thank you element
                try {
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
