import { Document, DocumentChunk, DocumentStatus, Release, SpecSeries } from '@prisma/client'

export interface CreateDocumentDto {
  name: string
  fileName: string
  filePath: string
  fileSize: number
  mimeType: string
  specNumber?: string
  specTitle?: string
  series?: SpecSeries
  release?: Release
  uploadedBy: string
}

export interface CreateChunkDto {
  documentId: string
  chunkIndex: number
  content: string
  contentHash: string
  pageStart?: number
  pageEnd?: number
  section?: string
  tokenCount?: number
}

export interface VectorSearchResult {
  chunk: DocumentChunk & { document: Document }
  similarity: number
}

export interface IDocumentRepository {
  findById(id: string): Promise<Document | null>
  findMany(params: {
    page: number
    limit: number
    status?: DocumentStatus
    series?: SpecSeries
    release?: Release
    search?: string
  }): Promise<{ documents: Document[]; total: number }>
  create(data: CreateDocumentDto): Promise<Document>
  updateStatus(id: string, status: DocumentStatus, errorMessage?: string): Promise<Document>
  updateMetadata(
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
  ): Promise<Document>
  delete(id: string): Promise<void>

  // Chunk operations
  createChunks(chunks: CreateChunkDto[]): Promise<void>
  findChunksByDocumentId(documentId: string): Promise<DocumentChunk[]>
  setEmbedding(chunkId: string, embedding: number[]): Promise<void>
  vectorSearch(params: {
    embedding: number[]
    limit?: number
    documentIds?: string[]
  }): Promise<VectorSearchResult[]>
  deleteChunks(documentId: string): Promise<void>
}
