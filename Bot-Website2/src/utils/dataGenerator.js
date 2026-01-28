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
        const firstNames = [
            "محمد", "أحمد", "ياسين", "عبد الله", "يوسف", "أمين", "علي", "وليد", "كريم", "عمر",
            "مريم", "فاطمة", "آسيا", "سارة", "خديجة", "عائشة", "نورة", "ليلى", "أسماء", "هدى"
        ];
        const lastNames = [
            "بن أحمد", "ساعدي", "بورحلة", "منصوري", "تواتي", "رحماني", "يحيى", "بن يوسف",
            "العمري", "بوعزيز", "حداد", "سليماني", "موساوي", "بلحاج", "قاسم", "بن علي", "مزيان"
        ];

        const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
        const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];

        return `${firstName} ${lastName}`;
    }

    generateAlgerianPhone() {
        const prefixes = ['05', '06', '07'];
        const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];

        let suffix;
        if (prefix === '05') {
            // Adds 55 or 56 after 05, then 6 random digits
            const subPrefix = Math.random() < 0.5 ? '55' : '56';
            suffix = subPrefix + faker.string.numeric(6);
        } else {
            // Default behavior for other prefixes (8 random digits)
            suffix = faker.string.numeric(8);
        }

        return `${prefix}${suffix}`;
    }
}

module.exports = new DataGenerator();
