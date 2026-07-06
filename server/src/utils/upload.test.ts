import test from 'node:test'
import assert from 'node:assert/strict'
import { isAllowedUploadFile } from './upload'

function file(originalname: string, mimetype: string) {
  return { originalname, mimetype }
}

test('upload validation rejects user-provided SVG files', () => {
  const result = isAllowedUploadFile(file('logo.svg', 'image/svg+xml'))

  assert.equal(result.allowed, false)
  assert.match(result.message || '', /只允许上传/)
})

test('upload validation keeps common image formats enabled', () => {
  assert.equal(isAllowedUploadFile(file('cover.jpg', 'image/jpeg')).allowed, true)
  assert.equal(isAllowedUploadFile(file('cover.png', 'image/png')).allowed, true)
  assert.equal(isAllowedUploadFile(file('cover.webp', 'image/webp')).allowed, true)
})

test('upload validation keeps video and mp3 enabled only for media uploaders', () => {
  assert.equal(isAllowedUploadFile(file('intro.mp4', 'video/mp4'), { allowVideo: true }).allowed, true)
  assert.equal(isAllowedUploadFile(file('notify.mp3', 'audio/mpeg'), { allowAudio: true }).allowed, true)

  assert.equal(isAllowedUploadFile(file('intro.mp4', 'video/mp4')).allowed, false)
  assert.equal(isAllowedUploadFile(file('notify.mp3', 'audio/mpeg')).allowed, false)
})
