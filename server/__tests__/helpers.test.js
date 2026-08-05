import { describe, it, expect, vi } from 'vitest'
import {
  sendApiError,
  parseOffset,
  parseLimit,
  normalizeText,
  getClientIdentifier,
  parseCookies,
  isPrivateIpv4,
  isPrivateIpv6,
  isPrivateIp,
} from '../middleware/helpers.js'

describe('sendApiError', () => {
  it('sends status and JSON body', () => {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    }
    sendApiError(res, 404, 'NOT_FOUND', 'Not found.')
    expect(res.status).toHaveBeenCalledWith(404)
    expect(res.json).toHaveBeenCalledWith({ code: 'NOT_FOUND', message: 'Not found.' })
  })
})

describe('parseOffset', () => {
  it('returns 0 for non-numeric values', () => {
    expect(parseOffset(undefined)).toBe(0)
    expect(parseOffset('abc')).toBe(0)
    expect(parseOffset(NaN)).toBe(0)
  })

  it('floors and clamps negative values', () => {
    expect(parseOffset(5.7)).toBe(5)
    expect(parseOffset(-3)).toBe(0)
  })
})

describe('parseLimit', () => {
  it('returns fallback for non-numeric', () => {
    expect(parseLimit(undefined, 100, 500)).toBe(100)
  })

  it('clamps to max', () => {
    expect(parseLimit(9999, 100, 500)).toBe(500)
  })

  it('floors decimal', () => {
    expect(parseLimit(5.9, 100, 500)).toBe(5)
  })
})

describe('normalizeText', () => {
  it('trims and truncates', () => {
    expect(normalizeText('  hello  ', 5)).toBe('hello')
    expect(normalizeText('toolongtext', 5)).toBe('toolo')
  })

  it('handles null/undefined', () => {
    expect(normalizeText(null, 10)).toBe('')
    expect(normalizeText(undefined, 10)).toBe('')
  })
})

describe('getClientIdentifier', () => {
  it('uses x-forwarded-for first entry', () => {
    const req = { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' }, ip: '127.0.0.1' }
    expect(getClientIdentifier(req)).toBe('1.2.3.4')
  })

  it('falls back to req.ip', () => {
    const req = { headers: {}, ip: '10.0.0.1' }
    expect(getClientIdentifier(req)).toBe('10.0.0.1')
  })

  it('returns unknown if no ip', () => {
    const req = { headers: {} }
    expect(getClientIdentifier(req)).toBe('unknown')
  })
})

describe('parseCookies', () => {
  it('parses cookie string', () => {
    const req = { headers: { cookie: 'a=1; b=hello%20world' } }
    expect(parseCookies(req)).toEqual({ a: '1', b: 'hello world' })
  })

  it('returns empty for missing cookie', () => {
    expect(parseCookies({ headers: {} })).toEqual({})
  })
})

describe('isPrivateIpv4', () => {
  it.each([
    ['10.0.0.1', true],
    ['127.0.0.1', true],
    ['169.254.1.1', true],
    ['172.16.0.1', true],
    ['172.31.255.255', true],
    ['192.168.1.1', true],
    ['100.64.0.1', true],
    ['0.0.0.0', true],
    ['8.8.8.8', false],
    ['1.1.1.1', false],
    ['172.15.0.1', false],
    ['172.32.0.1', false],
  ])('isPrivateIpv4(%s) === %s', (ip, expected) => {
    expect(isPrivateIpv4(ip)).toBe(expected)
  })
})

describe('isPrivateIpv6', () => {
  it.each([
    ['::1', true],
    ['::', true],
    ['fc00::1', true],
    ['fd00::1', true],
    ['fe80::1', true],
    ['2001:4860:4860::8888', false],
  ])('isPrivateIpv6(%s) === %s', (ip, expected) => {
    expect(isPrivateIpv6(ip)).toBe(expected)
  })
})

describe('isPrivateIp', () => {
  it('detects IPv4 private', () => {
    expect(isPrivateIp('192.168.1.1')).toBe(true)
  })

  it('detects IPv6 private', () => {
    expect(isPrivateIp('::1')).toBe(true)
  })

  it('returns false for non-IP strings', () => {
    expect(isPrivateIp('not-an-ip')).toBe(false)
  })
})
