const { createLogger, format, transports } = require('winston');
require('winston-daily-rotate-file');
const path = require('path');
const fs = require('fs');

const logDir = 'C:/Cabneo/AssistantApp/logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const logFormat = format.printf(({ timestamp, level, message, module, func, ...meta }) => {
  let metaString = Object.keys(meta).length ? JSON.stringify(meta) : '';
  return `${timestamp} [${level.toUpperCase()}] [${module}${func ? ':' + func : ''}] ${message} ${metaString}`;
});

function getLogger(moduleName) {
  return createLogger({
    level: 'debug',
    format: format.combine(
      format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      format.errors({ stack: true }),
      format.splat(),
      logFormat
    ),
    transports: [
      new transports.DailyRotateFile({
        filename: path.join(logDir, 'app-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        maxSize: '10m',
        maxFiles: '14d',
        zippedArchive: true,
        level: 'debug',
      }),
      ...(process.env.NODE_ENV !== 'production' ? [
        new transports.Console({
          level: 'info',
          format: format.combine(format.colorize(), logFormat)
        })
      ] : [])
    ],
    exceptionHandlers: [
      new transports.File({ filename: path.join(logDir, 'exceptions.log') })
    ],
    rejectionHandlers: [
      new transports.File({ filename: path.join(logDir, 'rejections.log') })
    ]
  });
}

module.exports = getLogger; 