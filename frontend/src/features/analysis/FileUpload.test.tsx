/**
 * FileUpload component unit tests.
 *
 * Mocks: analysisApi.uploadLogFile
 * Tests:
 *   - unsupported extensions are rejected client-side (no network call)
 *   - valid .log file renders Analyze logs button enabled
 *   - successful upload shows parsed line count
 *   - server error is displayed as an alert
 *   - drag-and-drop and file info display
 * [Source: story-2.4, task 4, AC4, AC5]
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import FileUpload from './FileUpload.js'

const { mockUploadLogFile } = vi.hoisted(() => ({
  mockUploadLogFile: vi.fn<(file: File) => Promise<{ cacheId: string; lineCount: number; redactionSummary: unknown }>>(),
}))

vi.mock('./analysisApi.js', () => ({
  uploadLogFile: mockUploadLogFile,
}))

/** Simulate a file-input change with a given File object */
function uploadFile(input: HTMLElement, file: File) {
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  fireEvent.change(input)
}

describe('FileUpload', () => {
  beforeEach(() => {
    mockUploadLogFile.mockReset()
  })

  it('"Analyze logs" button is disabled when no file is selected', () => {
    render(<FileUpload />)
    expect(screen.getByRole('button', { name: /analyze logs/i })).toBeDisabled()
  })

  it('shows error for unsupported extension without calling upload API', async () => {
    render(<FileUpload />)
    const input = screen.getByLabelText(/log file/i)
    uploadFile(input, new File(['a,b,c'], 'data.csv', { type: 'text/csv' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/unsupported file type/i)
    expect(mockUploadLogFile).not.toHaveBeenCalled()
  })

  it('enables Analyze logs button and clears error for a valid .log file', async () => {
    render(<FileUpload />)
    const input = screen.getByLabelText(/log file/i)

    // First upload a bad file to set an error
    uploadFile(input, new File([''], 'bad.csv', { type: 'text/csv' }))
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    // Now upload valid file — error should clear, button enabled
    uploadFile(input, new File(['line1\nline2'], 'server.log', { type: 'text/plain' }))
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /analyze logs/i })).not.toBeDisabled()
  })

  it('shows file name after file selection', async () => {
    render(<FileUpload />)
    const input = screen.getByLabelText(/log file/i)
    uploadFile(input, new File(['line1\nline2'], 'server.log', { type: 'text/plain' }))
    expect(await screen.findByText('server.log')).toBeInTheDocument()
  })

  it('"×" remove button clears the selected file', async () => {
    render(<FileUpload />)
    const input = screen.getByLabelText(/log file/i)
    uploadFile(input, new File(['line1'], 'server.log', { type: 'text/plain' }))
    expect(await screen.findByText('server.log')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /remove file/i }))

    await waitFor(() => expect(screen.queryByText('server.log')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: /analyze logs/i })).toBeDisabled()
  })

  it('displays parsed line count on successful upload', async () => {
    mockUploadLogFile.mockResolvedValue({ cacheId: 'test-id', lineCount: 2, redactionSummary: {} })
    render(<FileUpload />)

    const input = screen.getByLabelText(/log file/i)
    uploadFile(input, new File(['line1\nline2'], 'server.log', { type: 'text/plain' }))
    fireEvent.submit(screen.getByRole('button', { name: /analyze logs/i }).closest('form')!)

    await waitFor(() => {
      expect(screen.getByText(/parsed/i)).toHaveTextContent('2')
    })
  })

  it('shows 413 error message when server returns payload too large', async () => {
    const err = Object.assign(new Error('too large'), { status: 413 })
    mockUploadLogFile.mockRejectedValue(err)

    render(<FileUpload />)
    const input = screen.getByLabelText(/log file/i)
    uploadFile(input, new File(['x'], 'big.log', { type: 'text/plain' }))
    fireEvent.submit(screen.getByRole('button', { name: /analyze logs/i }).closest('form')!)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/too large/i)
    })
  })
})
