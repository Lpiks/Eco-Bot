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
        } catch (e) { }

        // --- Interaction Logic (LightFunnels) ---

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
            const phone = identity.phone.startsWith('0') ? identity.phone : '0' + identity.phone;
            await actionManager.typeHuman(phoneInput, phone);
        } else {
            logger.warn('Phone input (phone) not found');
        }

        // 3. Wilaya (Readonly Input -> Click -> Select ANY Random Option)
        const wilayaInput = 'input[name="state"]';
        if (await page.$(wilayaInput)) {
            try {
                logger.info('Clicking Wilaya input to open dropdown...');
                await page.click(wilayaInput);
                await new Promise(r => setTimeout(r, 1500)); // Wait for dropdown animation

                logger.info('Selecting a RANDOM Wilaya option as requested...');

                // Broad selector for any list item or option-like div
                // We avoid the first one if it's "Search" or a header, usually index 0 might be search input parent
                const optionsXpath = `//div[@role="option"] | //li | //div[contains(@class, "item")]`;
                let options = await page.$x(optionsXpath);

                if (options.length > 0) {
                    // Pick a random index. If list is small, pick index 0 or 1.
                    // If list is large (Wilayas), pick between 1 and min(length, 10) to avoid scrolling too far
                    const maxIndex = Math.min(options.length - 1, 10);
                    const randomIndex = Math.floor(Math.random() * (maxIndex + 1));

                    try {
                        // Ensure it's visible or scroll to it
                        await options[randomIndex].click();
                        logger.info(`Clicked option at index ${randomIndex}`);
                    } catch (clickErr) {
                        logger.warn(`Failed to click random option ${randomIndex}, trying index 0...`);
                        await options[0].click();
                    }
                } else {
                    // Fallback: strict text search not used, but we might just click the 2nd div in the container
                    logger.warn('No standard options found. Trying generic div click in listbox.');
                    const genericXpath = `//div[@role="listbox"]//div`;
                    options = await page.$x(genericXpath);
                    if (options.length > 1) {
                        await options[1].click(); // Click 2nd element
                    }
                }
            } catch (e) {
                logger.warn(`Wilaya selection failed: ${e.message}`);
                await actionManager.takeScreenshot(`wilaya_fail_${iteration}`);
            }
        } else {
            logger.warn('Wilaya input (name="state") not found');
        }

        // 4. Commune (City) - Strict Wait
        const communeInput = 'input[name="city"]';
        if (await page.$(communeInput)) {
            // Check if Wilaya has value
            const wilayaInputEl = await page.$('input[name="state"]');
            if (wilayaInputEl) {
                let wilayaValue = await page.evaluate(el => el.value, wilayaInputEl);
                let retries = 0;
                while (!wilayaValue && retries < 15) {
                    logger.info('Waiting for Wilaya to be filled...');
                    await new Promise(r => setTimeout(r, 1000));
                    wilayaValue = await page.evaluate(el => el.value, wilayaInputEl);
                    retries++;
                }
                if (!wilayaValue) logger.warn('Proceeding to Commune despite empty Wilaya.');
            }
            await actionManager.typeHuman(communeInput, identity.commune);
        } else {
            logger.warn('Commune input (name="city") not found');
        }

        // 5. Quantity
        const qtyInput = 'input[type="number"]';
        if (await page.$(qtyInput)) {
            try {
                let qty = identity.quantity;
                if (qty > 3) qty = 3;
                await page.evaluate(el => el.value = '', await page.$(qtyInput));
                await actionManager.typeHuman(qtyInput, qty.toString());
            } catch (e) {
                logger.warn('Failed to set quantity:', e);
            }
        }

        // 6. Submit
        if (config.DRY_RUN) {
            logger.info('DRY RUN MODE: Skipping final submit click.');
        } else {
            try {
                const btnSelector = 'button._98';
                const btnXpath = `//button[contains(., "اشتري")]`;
                const btnGeneric = 'button[type="submit"]';

                let submitBtn = await page.$(btnSelector);
                if (!submitBtn) {
                    const [btn] = await page.$x(btnXpath);
                    submitBtn = btn;
                }
                if (!submitBtn) submitBtn = await page.$(btnGeneric);

                if (submitBtn) {
                    try { await page.evaluate(el => el.scrollIntoView(), submitBtn); } catch (e) { }
                    await new Promise(r => setTimeout(r, 500));
                    await submitBtn.click();
                    logger.info('Clicked Submit button.');
                    try { await page.waitForNavigation({ timeout: 15000, waitUntil: 'networkidle0' }); } catch (navErr) { }
                } else {
                    logger.warn('Submit button NOT found.');
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
    const LOOP_COUNT = 20;
    logger.info(`Starting Bot Run: ${LOOP_COUNT} iterations scheduled.`);

    for (let i = 1; i <= LOOP_COUNT; i++) {
        await processOrder(i);

        if (i < LOOP_COUNT) {
            // Random delay between 1 and 5 minutes
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
