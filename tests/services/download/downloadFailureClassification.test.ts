import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: () => 'C:/tmp'
  }
}))

import DownloadService from '../../../src/services/downloadService'
import { DownloadHttpError } from '../../../src/services/download/httpDownloader'

describe('DownloadService failure classification', () => {
  const service = DownloadService.getInstance()
  const classify = (
    service as unknown as { classifyFailure: (err: unknown) => string }
  ).classifyFailure.bind(service)

  it('classifies 429 as rate-limit', () => {
    expect(classify(new DownloadHttpError('Rate limit', 429))).toBe('rate-limit')
    expect(classify(new Error('HTTP 429 Too Many Requests'))).toBe('rate-limit')
  })

  it('classifies 404, 410, 403, 451, 400 as not-found item-level errors', () => {
    expect(classify(new DownloadHttpError('Not found', 404))).toBe('not-found')
    expect(classify(new DownloadHttpError('Gone', 410))).toBe('not-found')
    expect(classify(new DownloadHttpError('Forbidden', 403))).toBe('not-found')
    expect(classify(new DownloadHttpError('Unavailable for legal reasons', 451))).toBe('not-found')
    expect(classify(new DownloadHttpError('Bad Request', 400))).toBe('not-found')
  })

  it('classifies 5xx and network errors as transient mirror errors', () => {
    expect(classify(new DownloadHttpError('Internal Server Error', 500))).toBe('transient')
    expect(classify(new DownloadHttpError('Bad Gateway', 502))).toBe('transient')
    expect(classify(new DownloadHttpError('Service Unavailable', 503))).toBe('transient')
    expect(classify(new DownloadHttpError('Gateway Timeout', 504))).toBe('transient')
    expect(classify(new DownloadHttpError('Request Timeout', 408))).toBe('transient')
    expect(classify(new Error('socket hang up'))).toBe('transient')
    expect(classify(new Error('ECONNRESET'))).toBe('transient')
  })

  it('classifies local filesystem permission errors as permanent', () => {
    expect(classify(new Error('EACCES: permission denied'))).toBe('permanent')
    expect(classify(new Error('ENOSPC: no space left on device'))).toBe('permanent')
  })
})
