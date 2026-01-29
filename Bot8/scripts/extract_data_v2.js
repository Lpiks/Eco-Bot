const fs = require('fs');
const leblad = require('@dzcode-io/leblad');

const wilayas = leblad.getWilayaList();
const data = [];

wilayas.forEach(w => {
    // Assuming 'w' has 'mattricule' or similar. 
    // Let's print one to be sure if this script was debugging, but i'll assume standard naming or check documentation behavior.
    // Based on common knowledge of this lib, it likely has 'matricule' or 'code'.
    // If w is just a string, it's different.
    // But getWilayaList usually returns objects.

    // Let's rely on the previous debug output "getBaladyiatsForWilaya".
    // I'll assume 'w' has a 'name' and 'mattricule'. 
    // Note: The lib might accept the name or code.

    // Let's try to pass the 'mattricule' to getBaladyiatsForWilaya.
    // If 'mattricule' is not present, I might need to look at the object.

    // To be safe, I'll log the first wilaya object structure in this script too before processing.
});

// BETTER APPROACH: Write a script that first explores the structure of the return of getWilayaList.
const allWilayas = leblad.getWilayaList();
console.log('First Wilaya Object:', JSON.stringify(allWilayas[0], null, 2));

const fullData = allWilayas.map(w => {
    // Try to get communes. 
    // The previous output showed `getBaladyiatsForWilaya`.
    const communes = leblad.getBaladyiatsForWilaya(w.mattricule); // Spelling might be 'old' or 'matricule'. 
    // Actually, looking at typical dzcode libs, it might be 'mattricule' or just 'code'.
    // Let's assume 'mattricule' based on common french spelling in DZ libs, or `code`.

    // Wait, let's just dump the wilaya object first to be sure.
    // I will write a script that JUST prints the first wilaya and its communes if possible.
    return {
        wilaya_code: w.mattricule,
        wilaya_name: w.name,
        communes: communes ? communes.map(c => c.name) : []
    };
});
// This is risky without knowing the property name.

// Let's do a safe extraction script:
// 1. Get List. 2. Print keys of first item. 3. Try to fetch communes.

const safeData = allWilayas.map(w => {
    // The lib likely uses 'mattricule' (with double t) or 'matricule'.
    // Let's try to find the property that looks like a code.
    const code = w.matricule || w.mattricule || w.code || w.id;
    const name = w.name || w.nom;

    let communesList = [];
    try {
        communesList = leblad.getBaladyiatsForWilaya(code);
    } catch (e) {
        console.log('Error fetching communes for', name, e.message);
    }

    return {
        wilaya_code: code,
        wilaya_name: name,
        communes: communesList ? communesList.map(c => c.name || c.nom) : []
    };
});

fs.writeFileSync('data/algeria_cities.json', JSON.stringify(safeData, null, 2));
console.log('Done.');
