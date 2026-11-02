/**
 * image_utils.js
 * Image format detection, metadata inspection, and container analysis utilities.
 */

'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Markers indicative of an ISO 21496-1 / Adobe / Apple HDR gain map stream inside a JPEG container.
 */
const ULTRA_HDR_MARKERS = [
  Buffer.from('hdrgm:Version'),
  Buffer.from('hdrgm:version'),
  Buffer.from('http://ns.adobe.com/hdr-gain-map/'),
  Buffer.from('HDRGainMapVersion'),
  Buffer.from('HDRGainMap:HDRGainMapVersion'),
  Buffer.from('http://ns.apple.com/HDRGainMap/'),
];

/**
 * Detects image container format from file buffer (magic bytes) with extension fallback.
 * Can be passed a Buffer, a file path, or both (buffer, filePath).
 *
 * @param {Buffer|string} bufferOrPath - Image buffer or path to image file
 * @param {string} [filePath] - Optional file path for extension fallback
 * @returns {'jpeg' | 'heic' | 'png' | 'webp' | 'avif' | 'unknown'}
 */
function detectImageFormat(bufferOrPath, filePath = '') {
  let buffer = null;
  let targetPath = filePath;

  if (Buffer.isBuffer(bufferOrPath)) {
    buffer = bufferOrPath;
  } else if (typeof bufferOrPath === 'string') {
    targetPath = bufferOrPath;
    try {
      const fd = fs.openSync(bufferOrPath, 'r');
      const tempBuf = Buffer.alloc(64);
      const bytesRead = fs.readSync(fd, tempBuf, 0, 64, 0);
      fs.closeSync(fd);
      buffer = tempBuf.subarray(0, bytesRead);
    } catch (_) {
      // File could not be opened, will use extension fallback
    }
  }

  if (buffer && buffer.length >= 3) {
    // JPEG: Starts with SOI marker 0xFF 0xD8 0xFF
    if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
      return 'jpeg';
    }

    // PNG: 0x89 0x50 0x4E 0x47 (\x89PNG)
    if (
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4E &&
      buffer[3] === 0x47
    ) {
      return 'png';
    }

    // WebP: RIFF....WEBP
    if (
      buffer.length >= 12 &&
      buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
      buffer.subarray(8, 12).toString('ascii') === 'WEBP'
    ) {
      return 'webp';
    }

    // ISOBMFF box (ftyp box at offset 4..7)
    if (buffer.length >= 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
      const brand = buffer.subarray(8, 12).toString('ascii').toLowerCase();
      const headerChunk = buffer.subarray(0, Math.min(buffer.length, 64)).toString('ascii').toLowerCase();

      // AVIF brands
      if (brand === 'avif' || brand === 'avis' || headerChunk.includes('avif') || headerChunk.includes('avis')) {
        return 'avif';
      }

      // HEIC / HEIF / HEVC brands
      const heicBrands = ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1'];
      if (heicBrands.some((b) => brand.startsWith(b)) || heicBrands.some((b) => headerChunk.includes(b))) {
        return 'heic';
      }
    }
  }

  // Fallback to file extension
  if (targetPath) {
    const ext = path.extname(targetPath).toLowerCase();
    if (['.jpg', '.jpeg'].includes(ext)) return 'jpeg';
    if (['.heic', '.heif'].includes(ext)) return 'heic';
    if (ext === '.png') return 'png';
    if (ext === '.webp') return 'webp';
    if (ext === '.avif') return 'avif';
  }

  return 'unknown';
}

/**
 * Fast inspection to detect if a JPEG buffer contains an Ultra HDR gain map.
 * @param {Buffer} buffer
 * @returns {boolean}
 */
function isUltraHdr(buffer) {
  if (!buffer || buffer.length < 100) return false;
  const scanLimit = Math.min(buffer.length, 2 * 1024 * 1024);
  const scanSlice = buffer.subarray(0, scanLimit);
  return ULTRA_HDR_MARKERS.some((marker) => scanSlice.includes(marker));
}

/**
 * Fast inspection to extract width and height from a JPEG buffer without spawning child processes.
 * @param {Buffer} buffer
 * @returns {{ width: number, height: number } | null}
 */
function getJpegDimensions(buffer) {
  if (!buffer || buffer.length < 4 || buffer[0] !== 0xFF || buffer[1] !== 0xD8) return null;
  let offset = 2;
  while (offset < buffer.length - 8) {
    if (buffer[offset] !== 0xFF) { offset++; continue; }
    const marker = buffer[offset + 1];
    if (marker === 0xC0 || marker === 0xC1 || marker === 0xC2) {
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      if (width > 0 && height > 0) return { width, height };
    }
    if (offset + 4 > buffer.length) break;
    const len = buffer.readUInt16BE(offset + 2);
    if (len < 2) break;
    offset += 2 + len;
  }
  return null;
}

module.exports = {
  detectImageFormat,
  isUltraHdr,
  getJpegDimensions,
  ULTRA_HDR_MARKERS,
};
