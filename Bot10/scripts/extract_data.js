const fs = require('fs');
const { wilayas } = require('@dzcode-io/leblad');

const data = wilayas.map(w => ({
    wilaya_code: w.matricule,
    wilaya_name: w.name,
    communes: w.dairas.flatMap(d => d.baladyas.map(b => b.name))
}));

fs.writeFileSync('data/algeria_cities.json', JSON.stringify(data, null, 2));
console.log('Data extracted to data/algeria_cities.json');
