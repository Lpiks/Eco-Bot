const dataGenerator = require('../src/utils/dataGenerator');

console.log('Generating 50 phone numbers for verification:');
const prefixes = {
    '07': ['0770', '0771', '0772', '0773', '0774', '0776', '0778', '0779'],
    '06': ['0658', '0670', '0671', '0672', '0673', '0674', '0675'],
    '05': ['0550', '0551', '0553', '0553', '0554', '0555', '0556', '0557', '0558', '0559']
};

const allAllowedPrefixes = [...prefixes['07'], ...prefixes['06'], ...prefixes['05']];

let invalidCount = 0;
for (let i = 0; i < 50; i++) {
    const phone = dataGenerator.generateAlgerianPhone();
    const prefix = phone.substring(0, 4);
    const isValid = allAllowedPrefixes.includes(prefix);

    console.log(`${i + 1}. ${phone} - ${isValid ? 'VALID' : 'INVALID'}`);

    if (!isValid) {
        invalidCount++;
        console.error(`ERROR: Invalid prefix generated: ${prefix}`);
    }
}

if (invalidCount === 0) {
    console.log('\nSUCCESS: All 50 generated numbers have valid prefixes.');
} else {
    console.error(`\nFAILURE: ${invalidCount} numbers had invalid prefixes.`);
}
