const generator = require('./dataGenerator');

console.log('--- Testing Generator ---');
for (let i = 0; i < 50; i++) {
    const identity = generator.generateIdentity();
    // Only verify phone numbers starting with 05
    if (identity.phone.startsWith('05')) {
        const isValid = identity.phone.startsWith('0555') || identity.phone.startsWith('0556');
        console.log(`[05 CHECK] ${identity.phone} -> ${isValid ? 'PASS' : 'FAIL'}`);
    }
    console.log(`Name: ${identity.fullName}`);
}
