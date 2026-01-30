const browserManager = require('./bot/browser');
const actionManager = require('./bot/actions');
const dataGenerator = require('./utils/dataGenerator');
const logger = require('./utils/logger');
const config = require('./config');
const fs = require('fs');
const path = require('path');

async function logClientData(identity, iteration) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] Iteration ${iteration}: Name: ${identity.fullName}, Phone: ${identity.phone}, Wilaya: ${identity.wilaya} (Code: ${identity.wilayaCode}), Commune: ${identity.commune}, Address: ${identity.address}, Qty: ${identity.quantity}\n`;
    const logPath = path.join(__dirname, '../logs/clients.txt');

    try {
        if (!fs.existsSync(path.dirname(logPath))) fs.mkdirSync(path.dirname(logPath), { recursive: true });
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
        // Generate a random address if not present in identity
        if (!identity.address) {
            identity.address = `Cité ${Math.floor(Math.random() * 500) + 10} Logements, Bloc ${String.fromCharCode(65 + Math.floor(Math.random() * 26))}`;
        }
        logger.info('Generated Identity:', identity);

        await logClientData(identity, iteration);

        const page = await browserManager.init();
        await actionManager.init(page);

        const targetUrl = config.TARGET_URL;
        await actionManager.navigate(targetUrl);

        // --- Interaction Logic (LightFunnels - Mahalaty) ---

        // 1. Full Name
        const nameInput = 'input[name="first_name"]';
        if (await page.$(nameInput)) {
            await actionManager.typeHuman(nameInput, identity.fullName);
        } else {
            logger.warn('Name input not found');
        }

        // 2. Phone
        const phoneInput = 'input[name="phone"]';
        if (await page.$(phoneInput)) {
            const phone = identity.phone.startsWith('0') ? identity.phone : '0' + identity.phone;
            await actionManager.typeHuman(phoneInput, phone);
        } else {
            logger.warn('Phone input not found');
        }

        // 3. Wilaya (Readonly Input -> Click -> Dropdown)
        const wilayaInput = 'input[name="state"]';
        if (await page.$(wilayaInput)) {
            let wilayaFilled = false;
            let attempts = 0;
            while (!wilayaFilled && attempts < 3) { // Retry up to 3 times
                attempts++;
                try {
                    logger.info(`Wilaya selection attempt ${attempts}/3...`);

                    const currentValue = await page.$eval(wilayaInput, el => el.value);
                    if (currentValue) {
                        wilayaFilled = true;
                        logger.info('Wilaya already filled.');
                        break;
                    }

                    await page.click(wilayaInput);
                    await new Promise(r => setTimeout(r, 2000)); // Wait for animation

                    // Strategy 1: Specific custom classes found in debug logs (LightFunnels/Mahalaty specific?)
                    // Structure seen: <div class="_hNlf"><div class="Ih5rs"><span class="FrNma">Adrar</span></div></div>
                    let options = await page.$$('span.FrNma, div._hNlf');

                    if (options.length === 0) {
                        // Strategy 2: Standard generic options (divs with role option or valid classes)
                        options = await page.$$('div[role="option"], li, .option, .item');
                    }

                    if (options.length === 0) {
                        // Strategy 3: Look for any div inside a listbox container
                        const listbox = await page.$('div[role="listbox"]');
                        if (listbox) {
                            options = await listbox.$$('div');
                        }
                    }

                    if (options.length === 0) {
                        // Strategy 4: Absolute fallback - try to find any elements that look like options in open dropdowns
                        // This usually involves looking for elements with specific classes often used in UI libs
                        options = await page.$$('.multiselect__option, .vs__dropdown-option, .el-select-dropdown__item');
                    }

                    if (options.length > 0) {
                        const maxIndex = Math.min(options.length - 1, 10);
                        const idx = Math.floor(Math.random() * (maxIndex + 1));

                        try {
                            const targetOption = options[idx] || options[0];
                            // Scroll into view to ensure visibility
                            await page.evaluate(el => el.scrollIntoView(), targetOption);
                            await targetOption.click();
                            logger.info(`Clicked option index ${idx}`);
                        } catch (clickErr) {
                            logger.warn('Failed to click chosen option, forcing click on first option via evaluate.');
                            if (options[0]) {
                                await page.evaluate(el => el.click(), options[0]);
                            }
                        }
                    } else {
                        logger.warn('No dropdown options found at all. Dumping partial HTML for debug.');
                        const bodyHTML = await page.content();
                        const relevantHTML = bodyHTML.substring(bodyHTML.indexOf('state'), bodyHTML.indexOf('state') + 2000);
                        logger.info('Partial HTML around "state": ' + relevantHTML);

                        // Last ditch attempt: force type key "ArrowDown" and "Enter"
                        logger.info('Attempting keyboard interaction fallback...');
                        await page.type(wilayaInput, String.fromCharCode(13)); // Enter?
                        await page.keyboard.press('ArrowDown');
                        await page.keyboard.press('ArrowDown');
                        await page.keyboard.press('Enter');
                    }

                    // Validation Check
                    await new Promise(r => setTimeout(r, 1000));
                    const val = await page.$eval(wilayaInput, el => el.value);
                    if (val && val.trim().length > 0) {
                        wilayaFilled = true;
                        logger.info(`Wilaya successfully set to: ${val}`);
                    } else {
                        logger.warn('Wilaya field remains empty. Retrying...');
                    }

                } catch (e) {
                    logger.warn(`Wilaya attempt ${attempts} failed: ${e.message}`);
                }
            }

            if (!wilayaFilled) {
                logger.error('Failed to set Wilaya after 3 attempts.');
                await actionManager.takeScreenshot(`wilaya_failed_final_${iteration}`);
            }
        } else {
            logger.warn('Wilaya input not found');
        }

        // 4. Commune (City)
        // Wait for Wilaya to be effectively selected as it often triggers Commune loading
        const stateInput = 'input[name="state"]';
        if (await page.$(stateInput)) {
            // Verify Wilaya is set before proceeding
            let stateVal = await page.$eval(stateInput, el => el.value);
            let stateRetries = 0;
            while ((!stateVal || stateVal.trim() === '') && stateRetries < 20) { // Wait up to 2 seconds
                await new Promise(r => setTimeout(r, 100));
                stateVal = await page.$eval(stateInput, el => el.value);
                stateRetries++;
            }
            if (!stateVal) logger.warn('Proceeding to Commune but Wilaya seems empty!');
        }

        await new Promise(r => setTimeout(r, 1000)); // Extra buffer for API fetch

        // Selectors to try
        const communeSelectors = ['input[name="city"]', 'input[name="commune"]', 'input[name="municipality"]'];
        let communeInput = null;
        let communeSelector = null;

        for (const sel of communeSelectors) {
            if (await page.$(sel)) {
                communeInput = await page.$(sel);
                communeSelector = sel;
                break;
            }
        }

        if (communeInput) {
            logger.info(`Found Commune input using selector: ${communeSelector}`);

            // Check if it is readonly (implies dropdown) or has combobox role
            const isReadonly = await page.$eval(communeSelector, el => el.hasAttribute('readonly') || el.getAttribute('role') === 'combobox');

            if (isReadonly) {
                // DROP-DOWN STRATEGY
                try {
                    logger.info('Commune is a dropdown/readonly. Attempting selection...');
                    await communeInput.click();
                    await new Promise(r => setTimeout(r, 1500)); // Wait for options

                    // Options Xpath - broadly match div items or list items
                    // Use 'xpath/.//...' if starting from element, or global xpath if just searching
                    const commOptionsXpath = `xpath///div[@role="option"] | //li | //div[contains(@class, "item")] | //div[contains(@class, "option")]`;
                    let cOptions = await page.$$(commOptionsXpath);

                    if (cOptions.length === 0) {
                        // Fallback generic
                        cOptions = await page.$$(`xpath///div[@role="listbox"]//div`);
                    }

                    if (cOptions.length > 0) {
                        let targetOption = null;

                        // clean text helper
                        const normalize = s => s.trim().toLowerCase();
                        const targetText = normalize(identity.commune);

                        for (const opt of cOptions) {
                            const optText = await page.evaluate(el => el.textContent, opt);
                            if (normalize(optText).includes(targetText) || targetText.includes(normalize(optText))) {
                                targetOption = opt;
                                logger.info(`Found matching commune option: ${optText}`);
                                break;
                            }
                        }

                        if (!targetOption) {
                            logger.warn(`Exact commune match for "${identity.commune}" not found. Picking random available option.`);
                            const randIdx = Math.floor(Math.random() * Math.min(cOptions.length, 5)); // Pick from top 5
                            targetOption = cOptions[randIdx];
                        }

                        if (targetOption) {
                            await targetOption.click();
                            logger.info('Clicked Commune option.');
                        }
                    } else {
                        logger.warn('No Commune options found after click.');
                    }

                } catch (err) {
                    logger.warn(`Commune dropdown interaction failed: ${err.message}`);
                }
            } else {
                // TEXT INPUT STRATEGY
                logger.info('Commune is a standard text input. Typing...');
                await actionManager.typeHuman(communeSelector, identity.commune);
            }
        } else {
            logger.warn('Commune input field not found (checked city, commune, municipality).');
        }

        // --- FINAL VERIFICATION ---
        // Ensure both Wilaya and Commune are present. If Wilaya was lost during Commune selection, re-fill it.
        if (await page.$(stateInput)) {
            const finalWilaya = await page.$eval(stateInput, el => el.value);
            if (!finalWilaya || finalWilaya.trim() === '') {
                logger.warn('ALERT: Wilaya was cleared after Commune selection! Re-selecting Wilaya...');
                // Quick re-select attempt (reuse previous logic or simple click-pick)
                await page.click(stateInput);
                await new Promise(r => setTimeout(r, 1000));
                const reOptions = await page.$$('span.FrNma, div._hNlf, div[role="option"]');
                if (reOptions.length > 0) {
                    await reOptions[0].click();
                    logger.info('Re-selected Wilaya.');
                }
            }
        }

        // 5. Address (Line1) - Input
        const addressInput = 'input[name="line1"]';
        if (await page.$(addressInput)) {
            await actionManager.typeHuman(addressInput, identity.address);
        } else {
            logger.warn('Address input (line1) not found');
        }

        // 6. Quantity (Input type number)
        const qtyInput = 'input[type="number"]';
        if (await page.$(qtyInput)) {
            // Ensure qty is set (it defaults to 1 usually)
            // If we want to randomize:
            // const qty = Math.floor(Math.random() * 2) + 1; // 1 or 2
            // await page.click(qtyInput, { clickCount: 3 });
            // await page.type(qtyInput, qty.toString());
        }

        // 7. Submit
        if (config.DRY_RUN) {
            logger.info('DRY RUN: Skipping submit.');
        } else {
            // Try robust selectors for "Buy Now"
            // The HTML has a button structure like: <button ... class="_29 ..."><div><p>اشتري الآن</p></div></button>
            // We can search by text content.
            try {
                const btnXpath = `xpath///button[contains(., "اشتري") or contains(., "Buy")]`;
                const [submitBtn] = await page.$$(btnXpath);

                if (submitBtn) {
                    await page.evaluate(el => el.scrollIntoView(), submitBtn);
                    await new Promise(r => setTimeout(r, 500));
                    await submitBtn.click();
                    logger.info('Clicked Submit button.');
                    await page.waitForNavigation({ timeout: 15000, waitUntil: 'networkidle0' }).catch(() => { });
                } else {
                    // Try generic submit
                    const genericBtn = await page.$('button[type="submit"]');
                    if (genericBtn) {
                        await genericBtn.click();
                        logger.info('Clicked generic submit button.');
                    } else {
                        logger.warn('Submit button NOT found.');
                        await actionManager.takeScreenshot(`missing_submit_${iteration}`);
                    }
                }
            } catch (e) {
                logger.warn(`Submit interaction failed: ${e.message}`);
            }
        }

        logger.info(`Iteration ${iteration} completed.`);

    } catch (error) {
        logger.error(`Error in iteration ${iteration}:`, error);
        await actionManager.takeScreenshot(`error_${iteration}`);
    } finally {
        await browserManager.close();
    }
}

async function run() {
    const LOOP_COUNT = 30; // Updated to 30 as requested
    logger.info(`Starting Bot7 Run: ${LOOP_COUNT} iterations.`);

    for (let i = 1; i <= LOOP_COUNT; i++) {
        await processOrder(i);

        if (i < LOOP_COUNT) {
            // Random delay 1-5 mins
            const delay = Math.floor(Math.random() * (300000 - 60000 + 1)) + 60000;
            const minutes = Math.floor(delay / 60000);
            logger.info(`Waiting ${minutes}m...`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
}

if (require.main === module) {
    run();
}

module.exports = { run };
