import { DocumentStatus, Release, SpecSeries } from '@prisma/client'
import { documentRepository } from '@/core/container'
import { pdfExtractor } from './PdfExtractor'
import { chunkingService } from './ChunkingService'
import { fileStorageService } from '@/infrastructure/storage/FileStorageService'
import { embeddingService } from '@/infrastructure/vector-store/EmbeddingService'
import { logger } from '@/utils/logger'

// Maps extracted release string → prisma enum
const RELEASE_MAP: Record<string, Release> = {
  '15': Release.REL_15,
  '16': Release.REL_16,
  '17': Release.REL_17,
  '18': Release.REL_18,
  '19': Release.REL_19,
}

// Maps spec number prefix → SpecSeries enum
function inferSeries(specNumber?: string): SpecSeries | undefined {
  if (!specNumber) return undefined
  const upper = specNumber.toUpperCase()
  if (upper.startsWith('TS 38') || upper.startsWith('TR 38')) return SpecSeries.TS_38
  if (upper.startsWith('TS 23') || upper.startsWith('TR 23')) return SpecSeries.TS_23
  if (upper.startsWith('TS 24') || upper.startsWith('TR 24')) return SpecSeries.TS_24
  if (upper.startsWith('TS 29') || upper.startsWith('TR 29')) return SpecSeries.TS_29
  if (upper.startsWith('TS 33') || upper.startsWith('TR 33')) return SpecSeries.TS_33
  if (upper.startsWith('TS 37') || upper.startsWith('TR 37')) return SpecSeries.TS_37
  return SpecSeries.OTHER
}

export class DocumentProcessor {
  async process(documentId: string, filePath: string): Promise<void> {
    logger.info('Processing document', { documentId })

    await documentRepository.updateStatus(documentId, DocumentStatus.PROCESSING)

    try {
      // ── 1. Read PDF ──────────────────────────────────────────────
      const buffer = await fileStorageService.readFile(filePath)

      // ── 2. Extract text ──────────────────────────────────────────
      const extracted = await pdfExtractor.extract(buffer)

      // ── 3. Update metadata from PDF ─────────────────────────────
      const releaseStr = extracted.metadata.release
      const release = releaseStr ? RELEASE_MAP[releaseStr] : undefined
      const specNumber = extracted.metadata.specNumber
      const series = inferSeries(specNumber)

      await documentRepository.updateMetadata(documentId, {
        specNumber,
        series,
        release,
        totalPages: extracted.totalPages,
      })

      // ── 4. Chunk text ────────────────────────────────────────────
      const chunks = chunkingService.chunkDocumentWithPages(
        extracted.fullText,
        extracted.pages,
      )

      if (chunks.length === 0) {
        throw new Error('No text chunks produced — PDF may be scanned/image-only')
      }

      logger.info('Chunks created', { documentId, count: chunks.length })

      // ── 5. Store chunks in DB ────────────────────────────────────
      await documentRepository.createChunks(
        chunks.map((c) => ({
          documentId,
          chunkIndex: c.index,
          content: c.content,
          contentHash: c.contentHash,
          pageStart: c.pageStart,
          pageEnd: c.pageEnd,
          section: c.section ? c.section.slice(0, 490) : c.section,
          tokenCount: c.tokenCount,
        })),
      )

      // ── 6. Generate & store embeddings ──────────────────────────
      try {
        const storedChunks = await documentRepository.findChunksByDocumentId(documentId)
        const texts = storedChunks.map((c) => c.content)
        const embeddings = await embeddingService.embedBatchLarge(texts)
        await Promise.all(
          storedChunks.map((c, i) => documentRepository.setEmbedding(c.id, embeddings[i]))
        )
        logger.info('Embeddings stored', { documentId, count: storedChunks.length })
      } catch (embErr: any) {
        logger.warn('Embedding generation skipped (non-fatal)', { documentId, error: embErr.message })
      }

      // ── 7. Mark READY ────────────────────────────────────────────
      await documentRepository.updateMetadata(documentId, {
        chunkCount: chunks.length,
        processedAt: new Date(),
      })
      await documentRepository.updateStatus(documentId, DocumentStatus.READY)

      logger.info('Document processing complete', { documentId, chunks: chunks.length })
    } catch (err: any) {
      logger.error('Document processing failed', { documentId, error: err.message })
      await documentRepository.updateStatus(
        documentId,
        DocumentStatus.FAILED,
        err.message,
      )
      throw err
    }
  }
}

export const documentProcessor = new DocumentProcessor()
