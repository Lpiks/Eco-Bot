const leblad = require('@dzcode-io/leblad');

try {
    const list = leblad.getWilayaList();
    console.log('Is Array?', Array.isArray(list));
    if (list.length > 0) {
        console.log('First Item Keys:', Object.keys(list[0]));
        console.log('First Item:', JSON.stringify(list[0]));
    }
} catch (e) {
    console.log('Error:', e.message);
}
