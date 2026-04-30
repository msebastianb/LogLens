/**
 * FileUpload — log file upload UI for the /analysis route.
 *
 * AC1: file input accepting .log, .json, .ndjson
 * AC4: validate extension client-side before submit; show error for unsupported
 * AC5: on success, display parsed line count and first few lines
 * [Source: story-2.4, AC1, AC4, AC5]
 */
import { useState } from 'react'
import { UploadCloud } from 'lucide-react'
import { uploadLogFile } from './analysisApi.js'
import type { UploadResult } from './analysisApi.js'

interface Props {
  onSubmitStart?: () => void
  onUploadComplete?: (result: UploadResult) => void
  onUploadError?: () => void
}

const ALLOWED_EXTENSIONS = ['.log', '.json', '.ndjson']

const maxMB = import.meta.env.VITE_MAX_LOG_SIZE_MB ?? '10'

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '' : filename.slice(dot).toLowerCase()
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function FileUpload({ onSubmitStart, onUploadComplete, onUploadError }: Props = {}) {
  const [file, setFile] = useState<File | null>(null)
  const [extensionError, setExtensionError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ cacheId: string; lineCount: number; redactionSummary: unknown } | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  function processFile(selected: File | null) {
    setResult(null)
    setError(null)
    if (!selected) {
      setFile(null)
      setExtensionError(null)
      return
    }
    const ext = getExtension(selected.name)
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setExtensionError(`Unsupported file type: ${ext || '(none)'}. Allowed: .log, .json, .ndjson`)
      setFile(null)
      return
    }
    setExtensionError(null)
    setFile(selected)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    processFile(e.target.files?.[0] ?? null)
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }

  function handleDragLeave() {
    setIsDragging(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    processFile(e.dataTransfer.files[0] ?? null)
  }

  function clearFile() {
    setFile(null)
    setExtensionError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file) return
    onSubmitStart?.()
    setError(null)
    setResult(null)
    setUploading(true)
    try {
      const data = await uploadLogFile(file)
      onUploadComplete?.(data)
      setResult(data)
    } catch (ex) {
      const err = ex as { status?: number; message?: string }
      onUploadError?.()
      if (err.status === 413) {
        setError('File is too large. Please upload a smaller file.')
      } else if (err.status === 415) {
        setError('Unsupported file type.')
      } else if (err.status === 422) {
        setError(err.message ?? 'File is malformed and could not be parsed.')
      } else {
        setError('An unexpected error occurred. Please try again.')
      }
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div
        className={`min-h-44 rounded-xl border-2 border-dashed transition-all duration-200 flex flex-col items-center justify-center gap-3 p-8 ${
          isDragging
            ? 'border-teal-500 bg-teal-50 scale-[1.01]'
            : file
              ? 'border-teal-300 bg-teal-50/50'
              : 'border-zinc-300 bg-white hover:border-zinc-400 hover:bg-zinc-50'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {file ? (
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-teal-100 flex items-center justify-center">
                <UploadCloud className="w-4 h-4 text-teal-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-mono font-medium text-zinc-900 truncate">{file.name}</p>
                <p className="text-xs text-zinc-500">{formatBytes(file.size)}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={clearFile}
              aria-label="Remove file"
              className="flex-shrink-0 ml-3 text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 w-7 h-7 rounded-full flex items-center justify-center text-lg leading-none transition-colors duration-150 cursor-pointer"
            >
              ×
            </button>
          </div>
        ) : (
          <>
            <div className="w-12 h-12 rounded-xl bg-zinc-100 flex items-center justify-center">
              <UploadCloud className={`w-6 h-6 ${isDragging ? 'text-teal-600' : 'text-zinc-400'}`} />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-medium text-zinc-700">Drag and drop your log file here</p>
              <label
                htmlFor="log-file"
                className="text-sm text-teal-600 hover:text-teal-700 cursor-pointer font-medium underline underline-offset-2 transition-colors duration-150"
              >
                or click to browse
              </label>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-center">
              {['.log', '.json', '.ndjson'].map((ext) => (
                <span key={ext} className="text-xs font-mono bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded">
                  {ext}
                </span>
              ))}
              <span className="text-xs text-zinc-400">· Max {maxMB} MB</span>
            </div>
          </>
        )}
        <input
          id="log-file"
          type="file"
          accept=".log,.json,.ndjson"
          className="sr-only"
          onChange={handleFileChange}
          disabled={uploading}
          aria-label="Log file"
        />
      </div>

      {extensionError && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {extensionError}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <form onSubmit={(e) => void handleSubmit(e)} noValidate>
        <button
          type="submit"
          disabled={!file || uploading}
          className="w-full bg-teal-600 hover:bg-teal-700 active:bg-teal-800 text-white text-sm font-semibold py-2.5 px-4 rounded-lg disabled:opacity-40 transition-colors duration-150 cursor-pointer"
        >
          {uploading ? 'Uploading…' : 'Analyze logs'}
        </button>
      </form>

      {result && (
        <section aria-live="polite">
          <p>
            Parsed <strong>{result.lineCount}</strong> line{result.lineCount !== 1 ? 's' : ''}.
          </p>
        </section>
      )}
    </div>
  )
}
