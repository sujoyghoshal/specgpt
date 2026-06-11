import { config } from '@/config'
import { logger } from '@/utils/logger'

export interface DocumentJobData {
  documentId: string
  filePath: string
  userId: string
}

export let redisAvailable = false

// Check if Redis is reachable before creating a Bull queue
async function checkRedis(): Promise<boolean> {
  const url = config.redis.url
  const host = url ? new URL(url).hostname : 'localhost'
  const port = url ? parseInt(new URL(url).port || '6379') : 6379

  return new Promise((resolve) => {
    const net = require('net')
    const socket = new net.Socket()
    const timer = setTimeout(() => { socket.destroy(); resolve(false) }, 2000)
    socket.connect(port, host, () => { clearTimeout(timer); socket.destroy(); resolve(true) })
    socket.on('error', () => { clearTimeout(timer); resolve(false) })
  })
}

type Processor = (job: { id: string; data: DocumentJobData; progress: (n: number) => Promise<void> }) => Promise<void>

// Minimal queue shim used when Redis is unavailable
class InProcessQueue {
  private processor: Processor | null = null

  process(_concurrency: number, fn: Processor) {
    this.processor = fn
  }

  async add(data: DocumentJobData, opts?: { jobId?: string }) {
    if (!this.processor) return
    const jobId = opts?.jobId ?? data.documentId
    setImmediate(async () => {
      try {
        await this.processor!({ id: jobId, data, progress: async () => {} })
      } catch (err: any) {
        logger.error('In-process document job failed', { jobId, error: err.message })
      }
    })
  }

  async getJob(_id: string) { return null }
  on(_event: string, _fn: (...args: any[]) => void) { return this }
}

let _queue: any = new InProcessQueue()
// Captured when documentWorker calls .process() — replayed onto Bull if Redis becomes available
let _savedProcessor: { concurrency: number; fn: Processor } | null = null

export function getDocumentQueue() { return _queue }

// Try to init Bull if Redis is available
checkRedis().then(async (available) => {
  redisAvailable = available
  if (!available) {
    logger.warn('Redis not available — document processing will run in-process')
    return
  }

  const Bull = (await import('bull')).default
  const url = config.redis.url
  let redisOpts: any

  if (!url) {
    redisOpts = { redis: { host: 'localhost', port: 6379 } }
  } else {
    const parsed = new URL(url)
    redisOpts = {
      redis: {
        host: parsed.hostname,
        port: parseInt(parsed.port || '6379'),
        password: parsed.password || undefined,
        tls: url.startsWith('rediss://') ? {} : undefined,
      },
    }
  }

  const bull = new Bull<DocumentJobData>('document-processing', {
    ...redisOpts,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  })

  bull.on('error', (err) => logger.error('Document queue error', { error: err.message }))
  bull.on('failed', (job, err) => logger.error('Document job failed', { jobId: job.id, attempt: job.attemptsMade, error: err.message }))
  bull.on('completed', (job) => logger.info('Document job completed', { jobId: job.id }))

  _queue = bull

  // Register processor that was set up before Bull was ready
  if (_savedProcessor) {
    bull.process(_savedProcessor.concurrency, _savedProcessor.fn as any)
  }

  logger.info('Document queue connected to Redis')
})

// Export a proxy so imports always get the current queue instance
export const documentQueue = new Proxy({} as any, {
  get(_target, prop) {
    if (prop === 'process') {
      return (concurrency: number, fn: Processor) => {
        _savedProcessor = { concurrency, fn }
        return _queue.process(concurrency, fn)
      }
    }
    return typeof _queue[prop] === 'function'
      ? _queue[prop].bind(_queue)
      : _queue[prop]
  },
})
