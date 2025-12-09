// logger.js
import winston from 'winston';
import { format, transports } from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { fileURLToPath } from 'url';

// ES6 equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define log format
const logFormat = format.printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}] : ${message} `;
  if (metadata && Object.keys(metadata).length) {
    msg += JSON.stringify(metadata);
  }
  return msg;
});

// Create logger instance
const logger = winston.createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    logFormat
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        logFormat
      )
    }),
    new DailyRotateFile({
      filename: path.join(__dirname, 'logs', 'application-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d'
    })
  ]
});

// HTTP-specific logger
const httpLogger = winston.createLogger({
  level: 'http',
  transports: [
    new DailyRotateFile({
      filename: path.join(__dirname, 'logs', 'http-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'http'
    })
  ]
});


// In your logger.js
/*const { createLogger, format, transports } = require('winston');
require('winston-daily-rotate-file');

const fs = require('fs');
const path = require('path');

// Create logs directory if it doesn't exist
const logDir = 'logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir);
}

// Add this transport to your logger
new transports.DailyRotateFile({
  filename: `${logDir}/application-%DATE%.log`,
  datePattern: 'YYYY-MM-DD',
  zippedArchive: true,
  maxSize: '20m',
  maxFiles: '14d', // Keep logs for 14 days
  level: 'info'
})
*/
module.exports = { logger, httpLogger };