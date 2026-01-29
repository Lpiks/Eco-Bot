const config = require('./config');
const { run } = require('./main');

// Override config for verification
config.HEADLESS = false;
config.TARGET_URL = 'https://google.com'; // Use Google for a safe test or the user's placeholder

console.log('Starting verification run (Headless: false)...');
run().then(() => {
    console.log('Verification run finished.');
}).catch(err => {
    console.error('Verification run failed:', err);
});
