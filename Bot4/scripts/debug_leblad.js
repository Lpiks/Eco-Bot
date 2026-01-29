try {
    const leblad = require('@dzcode-io/leblad');
    console.log('Keys:', Object.keys(leblad));
    if (leblad.wilayas) {
        console.log('Wilayas type:', typeof leblad.wilayas);
        console.log('Wilayas length:', leblad.wilayas.length);
        console.log('First wilaya:', JSON.stringify(leblad.wilayas[0], null, 2));
    }
} catch (e) {
    console.error('Error:', e);
}
