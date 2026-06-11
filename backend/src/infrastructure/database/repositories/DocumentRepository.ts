import { Document, DocumentChunk, DocumentStatus, Release, SpecSeries } from '@prisma/client'
import { prisma } from '../client'
import {
  IDocumentRepository,
  CreateDocumentDto,
  CreateChunkDto,
  VectorSearchResult,
} from '@/domain/repositories/IDocumentRepository'

type SafeDocument = Omit<Document, 'fileSize'> & { fileSize: number }

function toSafe(doc: Document): SafeDocument {
  return { ...doc, fileSize: Number(doc.fileSize) }
}

export class DocumentRepository implements IDocumentRepository {
  async findById(id: string): Promise<Document | null> {
    const doc = await prisma.document.findUnique({ where: { id } })
    return doc ? (toSafe(doc) as unknown as Document) : null
  }

  async findMany(params: {
    page: number
    limit: number
    status?: DocumentStatus
    series?: SpecSeries
    release?: Release
    search?: string
  }): Promise<{ documents: Document[]; total: number }> {
    const { page, limit, status, series, release, search } = params
    const skip = (page - 1) * limit

    const where = {
      ...(status && { status }),
      ...(series && { series }),
      ...(release && { release }),
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { specNumber: { contains: search, mode: 'insensitive' as const } },
          { specTitle: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    }

    const [documents, total] = await prisma.$transaction([
      prisma.document.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.document.count({ where }),
    ])

    return { documents: documents.map(toSafe) as unknown as Document[], total }
  }

  async create(data: CreateDocumentDto): Promise<Document> {
    const doc = await prisma.document.create({
      data: {
        name: data.name,
        fileName: data.fileName,
        filePath: data.filePath,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        specNumber: data.specNumber,
        specTitle: data.specTitle,
        series: data.series,
        release: data.release,
        uploadedBy: data.uploadedBy,
      },
    })
    return toSafe(doc) as unknown as Document
  }

  async updateStatus(
    id: string,
    status: DocumentStatus,
    errorMessage?: string,
  ): Promise<Document> {
    const doc = await prisma.document.update({
      where: { id },
      data: {
        status,
        errorMessage,
        ...(status === DocumentStatus.READY && { processedAt: new Date() }),
      },
    })
    return toSafe(doc) as unknown as Document
  }

  async updateMetadata(
    id: string,
    data: {
      specNumber?: string
      specTitle?: string
      series?: SpecSeries
      release?: Release
      version?: string
      totalPages?: number
      chunkCount?: number
      processedAt?: Date
    },
  ): Promise<Document> {
    const doc = await prisma.document.update({
      where: { id },
      data: {
        ...data,
        specNumber: data.specNumber?.slice(0, 50),
        specTitle: data.specTitle?.slice(0, 500),
        version: data.version?.slice(0, 20),
      },
    })
    return toSafe(doc) as unknown as Document
  }

  async delete(id: string): Promise<void> {
    await prisma.document.delete({ where: { id } })
  }

  async findChunksByDocumentId(documentId: string): Promise<DocumentChunk[]> {
    return prisma.documentChunk.findMany({
      where: { documentId },
      orderBy: { chunkIndex: 'asc' },
    })
  }

  async createChunks(chunks: CreateChunkDto[]): Promise<void> {
    await prisma.documentChunk.createMany({
      data: chunks.map((c) => ({
        documentId: c.documentId,
        chunkIndex: c.chunkIndex,
        content: c.content,
        contentHash: c.contentHash,
        pageStart: c.pageStart,
        pageEnd: c.pageEnd,
        section: c.section?.slice(0, 500),
        tokenCount: c.tokenCount,
      })),
      skipDuplicates: true,
    })
  }

  async setEmbedding(chunkId: string, embedding: number[]): Promise<void> {
    await prisma.documentChunk.update({
      where: { id: chunkId },
      data: { embedding },
    })
  }

  async vectorSearch(params: {
    embedding: number[]
    limit?: number
    documentIds?: string[]
  }): Promise<VectorSearchResult[]> {
    const { embedding, limit = 5, documentIds } = params
    const limitVal = Math.min(limit, 20)

    const chunks = await prisma.documentChunk.findMany({
      where: {
        ...(documentIds && documentIds.length > 0 ? { documentId: { in: documentIds } } : {}),
        document: { status: 'READY' },
        NOT: { embedding: { isEmpty: true } },
      },
      include: { document: true },
    })

    // Cosine similarity in JS (no pgvector needed)
    const scored = chunks.map((chunk) => {
      const a = chunk.embedding
      const b = embedding
      let dot = 0, normA = 0, normB = 0
      for (let i = 0; i < a.length; i++) {
        dot += a[i] * b[i]
        normA += a[i] * a[i]
        normB += b[i] * b[i]
      }
      const similarity = normA && normB ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0
      return { chunk, similarity }
    })

    scored.sort((a, b) => b.similarity - a.similarity)

    return scored.slice(0, limitVal).map(({ chunk, similarity }) => ({
      chunk: chunk as DocumentChunk & { document: Document },
      similarity,
    }))
  }

  async deleteChunks(documentId: string): Promise<void> {
    await prisma.documentChunk.deleteMany({ where: { documentId } })
  }
}
