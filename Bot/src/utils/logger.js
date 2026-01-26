const winston = require('winston');
const path = require('path');
const config = require('../config');

const logFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
        return JSON.stringify({
            timestamp,
            level,
            message,
            ...meta
        });
    })
);

const logger = winston.createLogger({
    level: config.LOG_LEVEL,
    format: logFormat,
    transports: [
        new winston.transports.File({ filename: path.join(__dirname, '../../logs/combined.log') }),
        new winston.transports.File({ filename: path.join(__dirname, '../../logs/error.log'), level: 'error' }),
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        })
    ]
});

module.exports = logger;
