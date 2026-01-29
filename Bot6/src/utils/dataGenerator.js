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
        const useArabic = Math.random() < 0.5;

        if (useArabic) {
            const firstNamesAr = [
                "محمد", "أحمد", "ياسين", "عبد الله", "يوسف", "أمين", "علي", "وليد", "كريم", "عمر",
                "مريم", "فاطمة", "آسيا", "سارة", "خديجة", "عائشة", "نورة", "ليلى", "أسماء", "هدى"
            ];
            const lastNamesAr = [
                "بن أحمد", "ساعدي", "بورحلة", "منصوري", "تواتي", "رحماني", "يحيى", "بن يوسف",
                "العمري", "بوعزيز", "حداد", "سليماني", "موساوي", "بلحاج", "قاسم", "بن علي", "مزيان"
            ];

            const firstName = firstNamesAr[Math.floor(Math.random() * firstNamesAr.length)];
            const lastName = lastNamesAr[Math.floor(Math.random() * lastNamesAr.length)];

            return `${firstName} ${lastName}`;
        } else {
            const firstNamesFr = [
                "Mohamed", "Ahmed", "Yacine", "Abdellah", "Youcef", "Amine", "Ali", "Walid", "Karim", "Omar",
                "Meriem", "Fatima", "Assia", "Sarah", "Khadidja", "Aicha", "Noura", "Leila", "Asma", "Houda"
            ];
            const lastNamesFr = [
                "Benahmed", "Saadi", "Bourahla", "Mansouri", "Touati", "Rahmani", "Yahia", "Benyoucef",
                "Lamri", "Bouaziz", "Haddad", "Slimani", "Moussaoui", "Belhadj", "Kacem", "Benali", "Meziane"
            ];

            const firstName = firstNamesFr[Math.floor(Math.random() * firstNamesFr.length)];
            const lastName = lastNamesFr[Math.floor(Math.random() * lastNamesFr.length)];

            return `${firstName} ${lastName}`;
        }
    }

    generateAlgerianPhone() {
        // Define allowed prefixes for each start code
        const prefixMap = {
            '07': ['0770', '0771', '0772', '0773', '0774', '0776', '0778', '0779'],
            '06': ['0658', '0670', '0671', '0672', '0673', '0674', '0675'],
            '05': ['0550', '0551', '0553', '0553', '0554', '0555', '0556', '0557', '0558', '0559']
        };

        // Randomly select a start code (05, 06, or 07)
        const startCodes = Object.keys(prefixMap);
        const selectedStartCode = startCodes[Math.floor(Math.random() * startCodes.length)];

        // Randomly select a specific prefix from the chosen start code
        const allowedPrefixes = prefixMap[selectedStartCode];
        const selectedPrefix = allowedPrefixes[Math.floor(Math.random() * allowedPrefixes.length)];

        // Generate the remaining 6 digits
        const suffix = faker.string.numeric(6);

        return `${selectedPrefix}${suffix}`;
    }
}

module.exports = new DataGenerator();
