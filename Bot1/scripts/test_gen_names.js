const dataGenerator = require('../src/utils/dataGenerator');

console.log('Generating 50 identities for name verification:');

let arabicCount = 0;
let frenchCount = 0;

// Simple heuristic regex to detect Arabic characters
const arabicRegex = /[\u0600-\u06FF]/;

for (let i = 0; i < 50; i++) {
    const identity = dataGenerator.generateIdentity();
    const name = identity.fullName;

    // Check if name contains Arabic characters
    const isArabic = arabicRegex.test(name);

    if (isArabic) {
        arabicCount++;
    } else {
        frenchCount++;
    }

    console.log(`${i + 1}. ${name} - ${isArabic ? 'ARABIC' : 'FRENCH (LATIN)'}`);
}

console.log('\n--- Summary ---');
console.log(`Total Arabic Names: ${arabicCount}`);
console.log(`Total French (Latin) Names: ${frenchCount}`);

if (arabicCount > 0 && frenchCount > 0) {
    console.log('SUCCESS: Both scripts are being generated.');
} else {
    console.error('FAILURE: Only one script type was generated (or detection failed).');
}
