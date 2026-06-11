import 'module-alias/register'
import 'dotenv/config'

// Prisma returns BigInt for fileSize; make it JSON-serializable
;(BigInt.prototype as any).toJSON = function () { return Number(this) }

import { createApp } from './app'
import { config } from './config'
import { logger } from './utils/logger'
import { prisma } from './infrastructure/database/client'

import './infrastructure/queue/documentWorker'

async function bootstrap() {
  try {
    // Verify database connection
    await prisma.$connect()
    logger.info('Database connected successfully')

    const app = createApp()

    const server = app.listen(config.port, () => {
      logger.info(`5G SpecGPT API running`, {
        port: config.port,
        env: config.env,
        url: `http://localhost:${config.port}`,
      })
    })

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received — shutting down gracefully`)
      server.close(async () => {
        await prisma.$disconnect()
        logger.info('Server closed')
        process.exit(0)
      })
      setTimeout(() => {
        logger.error('Forced shutdown after timeout')
        process.exit(1)
      }, 10_000)
    }

    process.on('SIGTERM', () => shutdown('SIGTERM'))
    process.on('SIGINT', () => shutdown('SIGINT'))
  } catch (error) {
    logger.error('Failed to start server', { error })
    await prisma.$disconnect()
    process.exit(1)
  }
}

bootstrap()
