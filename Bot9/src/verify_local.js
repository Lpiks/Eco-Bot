const puppeteer = require('puppeteer');
const path = require('path');
const config = require('./config');

async function runLocalVerification() {
    console.log('Starting local verification...');
    const localHtmlPath = path.join(__dirname, '../analysis/target_site.html');
    const url = `file://${localHtmlPath}`;

    // Launch simpler browser instance for verification
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox']
    });
    const page = await browser.newPage();

    try {
        console.log(`Navigating to ${url}...`);
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        // Check Selectors from main.js logic
        const selectors = [
            { name: 'Name Input', selector: 'input[name="userName"]' },
            { name: 'Phone Input', selector: 'input[name="userPhone"]' },
            { name: 'Wilaya Select', selector: '#userCity' },
            { name: 'Commune Select', selector: '#userState' },
            { name: 'Quantity Input', selector: '#quantity' },
            { name: 'Submit Button', selector: 'button[type="submit"].btn-theme-primary' }
        ];

        let allFound = true;
        for (const item of selectors) {
            const found = await page.$(item.selector);
            if (found) {
                console.log(`[PASS] Found ${item.name} (${item.selector})`);
            } else {
                console.log(`[FAIL] Could NOT find ${item.name} (${item.selector})`);
                allFound = false;
            }
        }

        if (allFound) {
            console.log('SUCCESS: All critical selectors found in the local HTML.');
        } else {
            console.log('FAILURE: Some selectors missing.');
        }

    } catch (error) {
        console.error('Verification Error:', error);
    } finally {
        await browser.close();
    }
}

runLocalVerification();
