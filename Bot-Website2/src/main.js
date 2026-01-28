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

        // --- Interaction Logic (JustSell) ---

        // 1. Full Name
        const nameInput = 'input[name="userName"]';
        if (await page.$(nameInput)) {
            await actionManager.typeHuman(nameInput, identity.fullName);
        } else {
            logger.warn('Name input (userName) not found');
        }

        // 2. Phone
        const phoneInput = 'input[name="userPhone"]';
        if (await page.$(phoneInput)) {
            await actionManager.typeHuman(phoneInput, identity.phone);
        } else {
            logger.warn('Phone input (userPhone) not found');
        }

        // 3. Wilaya (Dropdown)
        const wilayaSelect = '#userCity';
        try {
            const wilayaCode = identity.wilayaCode;
            const targetValue = await page.$eval(wilayaSelect, (select, code) => {
                const options = Array.from(select.options);
                const option = options.find(opt => opt.value.startsWith(code + '|') || opt.value === code);
                return option ? option.value : null;
            }, wilayaCode);

            if (targetValue) {
                await actionManager.selectOption(wilayaSelect, targetValue);
                logger.info(`Selected Wilaya: ${identity.wilaya} (Value: ${targetValue})`);
            } else {
                logger.warn(`Wilaya option matching code ${wilayaCode} not found.`);
            }
        } catch (e) {
            logger.warn(`Wilaya selection failed: ${e.message}`);
        }

        // 4. Commune (Dropdown)
        const communeSelect = '#userState';
        try {
            await page.waitForFunction(
                (selector) => {
                    const el = document.querySelector(selector);
                    return el && !el.disabled && el.options.length > 1;
                },
                { timeout: 15000 },
                communeSelect
            );

            const communeName = identity.commune;
            const communeValue = await page.$eval(communeSelect, (select, name) => {
                const options = Array.from(select.options);
                const option = options.find(opt => opt.text.includes(name));
                return option ? option.value : null;
            }, communeName);

            if (communeValue) {
                await actionManager.selectOption(communeSelect, communeValue);
                logger.info(`Selected Commune: ${communeName} (Value: ${communeValue})`);
            } else {
                logger.warn(`Commune '${communeName}' not found in dropdown. Selecting random available option.`);
                const randomValue = await page.$eval(communeSelect, select => {
                    if (select.options.length > 1) {
                        const idx = Math.floor(Math.random() * (select.options.length - 1)) + 1;
                        return select.options[idx].value;
                    }
                    return null;
                });
                if (randomValue) {
                    await actionManager.selectOption(communeSelect, randomValue);
                    logger.info(`Selected Random Commune Value: ${randomValue}`);
                }
            }
        } catch (e) {
            logger.warn(`Commune wait/select failed: ${e.message}`);
        }

        // 5. Quantity
        const qtyInput = '#quantity';
        if (await page.$(qtyInput)) {
            await page.$eval(qtyInput, el => el.value = '');
            await actionManager.typeHuman(qtyInput, identity.quantity.toString());
        }

        // 6. Submit
        if (config.DRY_RUN) {
            logger.info('DRY RUN MODE: Skipping final submit click.');
        } else {
            const submitBtnSelector = 'button[type="submit"].btn-theme-primary';
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
            const delay = Math.floor(Math.random() * 5000) + 2000; // 2-7 seconds delay
            logger.info(`Waiting ${delay}ms before next iteration...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    logger.info('All iterations completed. Shutting down.');
}

if (require.main === module) {
    run();
}

module.exports = { run };
