// ══════════════════════════════════════════════════════════════════════════════
// MEDIA ENGINE — Types & Interfaces
// ══════════════════════════════════════════════════════════════════════════════
// Phase 0 ÉTAPE 6 — Foundation for the Media Engine.
// Prepares the organization of media assets:
//   - per-wedding media library
//   - storage abstraction (LOCAL filesystem now, R2 in Phase 9)
//   - upload/download with size limits per plan
//   - image transformation (sharp)
//   - video transcoding (future)
//
// Current state: Media stored on local filesystem under public/uploads/{slug}/.
// The Media Prisma model exists with storageProvider/storageKey columns.
// ══════════════════════════════════════════════════════════════════════════════

export type MediaType = 'PHOTO' | 'VIDEO' | 'LOGO' | 'DOCUMENT' | 'AUDIO';
export type MediaCategory = 'GALLERY' | 'COUPLE_STORY' | 'DOCUMENT' | 'HERO' | 'MUSIC' | 'OTHER';

/**
 * A media asset owned by a wedding.
 */
export interface MediaEntity {
  id: string;
  weddingId: string;
  type: MediaType;
  category: MediaCategory;
  storageProvider: 'LOCAL' | 'R2';
  storageKey: string | null;
  url: string;
  title: string | null;
  description: string | null;
  sizeBytes: number;
  mime: string | null;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Upload request — validated before storage.
 */
export interface MediaUploadInput {
  weddingId: string;
  file: File | Buffer;
  filename: string;
  mime: string;
  category: MediaCategory;
  title?: string;
  description?: string;
}

/**
 * Storage adapter abstraction — LOCAL now, R2 later.
 */
export interface IStorageAdapter {
  upload(input: MediaUploadInput): Promise<{ url: string; storageKey: string; sizeBytes: number }>;
  download(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
  getSignedUrl(storageKey: string, expiresIn?: number): Promise<string>;
}

/**
 * Media Engine interface — future implementation.
 */
export interface IMediaEngine {
  upload(input: MediaUploadInput): Promise<MediaEntity>;
  list(weddingId: string, filter?: { type?: MediaType; category?: MediaCategory }): Promise<MediaEntity[]>;
  delete(id: string): Promise<void>;
  reorder(weddingId: string, orderedIds: string[]): Promise<void>;
  transform(id: string, options: ImageTransformOptions): Promise<Buffer>;
}

export interface ImageTransformOptions {
  width?: number;
  height?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp' | 'avif';
  fit?: 'cover' | 'contain' | 'fill';
}
