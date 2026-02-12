import pino from 'pino';

const isTest = process.env.NODE_ENV === 'test';
const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';

const logger = pino({
  level: isTest ? 'silent' : (process.env.LOG_LEVEL || (isDev ? 'debug' : 'info')),
  ...(isDev && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'HH:MM:ss' }
    }
  })
});

export default logger;
