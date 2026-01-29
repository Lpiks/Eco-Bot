const fs = require('fs');
const leblad = require('@dzcode-io/leblad');

try {
    const wilayas = leblad.getWilayaList();
    const data = wilayas.map(w => {
        // Flatten all baladyiats (communes) from all dairats
        const communes = [];
        if (w.dairats && Array.isArray(w.dairats)) {
            w.dairats.forEach(d => {
                if (d.baladyiats && Array.isArray(d.baladyiats)) {
                    d.baladyiats.forEach(b => {
                        communes.push(b.name);
                    });
                }
            });
        }

        return {
            wilaya_code: w.mattricule.toString().padStart(2, '0'), // Ensure 2-digit format
            wilaya_name: w.name,
            communes: communes
        };
    });

    fs.writeFileSync('data/algeria_cities.json', JSON.stringify(data, null, 2));
    console.log(`Successfully extracted ${data.length} wilayas.`);
} catch (error) {
    console.error('Extraction failed:', error);
    process.exit(1);
}
