const { faker } = require('@faker-js/faker');
const fs = require('fs');
const path = require('path');

class DataGenerator {
    constructor() {
        try {
            const dataPath = path.join(__dirname, '../../data/algeria_cities.json');
            this.wilayas = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        } catch (error) {
            console.error('Error loading algeria_cities.json:', error);
            this.wilayas = [];
        }
    }

    generateIdentity() {
        const randomWilayaIndex = Math.floor(Math.random() * this.wilayas.length);
        const selectedWilaya = this.wilayas[randomWilayaIndex];

        const randomCommuneIndex = Math.floor(Math.random() * selectedWilaya.communes.length);
        const selectedCommune = selectedWilaya.communes[randomCommuneIndex];

        return {
            fullName: this.generateRealisticName(),
            phone: this.generateAlgerianPhone(),
            wilaya: selectedWilaya.wilaya_name,
            wilayaCode: selectedWilaya.wilaya_code,
            commune: selectedCommune,
            quantity: Math.floor(Math.random() * 3) + 1
        };
    }

    generateRealisticName() {
        // Faker's default might be too western, let's try to mix it or just use it for now.
        // For better realism, we could define a list of common Algerian names, 
        // but faker is acceptable for a first pass as requested.
        // Or we can use faker with a specific locale if available (fr is closest supported usually).
        // faker.locale = 'fr'; // (In newer faker versions, we might need to import locale-specific instance)
        return faker.person.fullName();
    }

    generateAlgerianPhone() {
        const prefixes = ['05', '06', '07'];
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
        const suffix = faker.string.numeric(8);
        return `${prefix}${suffix}`;
    }
}

module.exports = new DataGenerator();
