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

        // --- Interaction Logic (Express Checkout) ---

        // 1. Full Name
        const nameInput = 'input[name="fullName"]';
        if (await page.$(nameInput)) {
            await actionManager.typeHuman(nameInput, identity.fullName);
        } else {
            logger.warn('Name input (fullName) not found');
        }

        // 2. Phone
        const phoneInput = 'input[name="phone"]';
        if (await page.$(phoneInput)) {
            await actionManager.typeHuman(phoneInput, identity.phone);
        } else {
            logger.warn('Phone input (phone) not found');
        }

        // 3. Wilaya (Dropdown) - Values are simple IDs like "1", "16"
        const wilayaSelect = 'select[name="wilaya"]';
        try {
            if (await page.$(wilayaSelect)) {
                // identity.wilayaCode is "01", "16".
                // Remove leading zeros if present, to match value="1" etc.
                let code = identity.wilayaCode;
                if (code.startsWith('0') && code.length > 1) {
                    code = code.substring(1);
                }

                // Select option by value
                await page.select(wilayaSelect, code);

                // CRITICAL: Dispatch change event to ensure frontend reacts
                await page.$eval(wilayaSelect, el => {
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                });

                logger.info(`Selected Wilaya: ${identity.wilaya} (Value: ${code})`);

                // Wait for Commune dropdown to populate
                await new Promise(r => setTimeout(r, 2000));
            } else {
                logger.warn('Wilaya select (wilaya) not found');
            }
        } catch (e) {
            logger.warn(`Wilaya selection failed: ${e.message}`);
        }

        // 4. Commune/Address (Dropdown)
        const addressSelect = 'select[name="address"]';
        try {
            if (await page.$(addressSelect)) {
                logger.info('Waiting for Address dropdown to be enabled...');
                await page.waitForFunction(
                    (selector) => {
                        const el = document.querySelector(selector);
                        // Check if enabled (disabled attribute is false/missing) and has options
                        return el && !el.disabled && el.options.length > 1;
                    },
                    { timeout: 15000 },
                    addressSelect
                );

                const communeName = identity.commune;
                // Match by text (approximate)
                const foundValue = await page.$eval(addressSelect, (select, name) => {
                    const options = Array.from(select.options);
                    const option = options.find(opt => opt.text.toUpperCase().includes(name.toUpperCase()));
                    return option ? option.value : null;
                }, communeName);

                if (foundValue) {
                    await actionManager.selectOption(addressSelect, foundValue);
                    logger.info(`Selected Address/Commune: ${communeName} (Value: ${foundValue})`);
                } else {
                    logger.warn(`Address '${communeName}' not found. Selecting random.`);
                    await page.$eval(addressSelect, select => {
                        if (select.options.length > 1) {
                            const idx = Math.floor(Math.random() * (select.options.length - 1)) + 1;
                            select.selectedIndex = idx;
                            select.dispatchEvent(new Event('change', { bubbles: true }));
                        }
                    });
                }
            } else {
                logger.warn('Address select (address) not found');
            }
        } catch (e) {
            logger.warn(`Address wait/select failed: ${e.message}`);
        }

        // 5. Delivery Place (Radio)
        try {
            const homeRadio = 'input[name="deliveryPlace"][value="at_home"]';
            if (await page.$(homeRadio)) {
                await page.click(homeRadio);
                logger.info('Selected Delivery: Home (at_home)');
            }
        } catch (e) {
            logger.warn('Delivery place selection failed');
        }

        // 6. Submit
        if (config.DRY_RUN) {
            logger.info('DRY RUN MODE: Skipping final submit click.');
        } else {
            // Button is <button type="button" class="btn btn-primary ..."><span>أُطلب الآن</span></button>
            const submitBtnSelector = 'button.btn-primary';
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
