import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
import { PDFDocument, degrees } from 'pdf-lib';
import { createWorker } from 'tesseract.js';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LANG_PATH = path.join(ROOT, 'bot', 'tessdata');
const LONG_SIDE = 5200;
const SURE = 12;
const MIN_CONFIDENCE = 4;

globalThis.DOMMatrix ||= DOMMatrix;
globalThis.ImageData ||= ImageData;
globalThis.Path2D ||= Path2D;

function normalize(angle) {
  return ((Number(angle) % 360) + 360) % 360;
}

export async function uprightPdf(bytes) {
  const input = Buffer.from(bytes);
  const turns = await measureTurns(input);
  if (turns.every((turn) => !turn)) return input;
  return rewrite(input, turns);
}

async function measureTurns(bytes) {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs'),
  ).href;
  const worker = await createWorker('osd', 0, {
    langPath: LANG_PATH,
    cachePath: path.join(os.tmpdir(), 'esvetvisit-tess'),
    gzip: true,
  });
  let task;
  try {
    task = pdfjs.getDocument({
      data: new Uint8Array(bytes),
      isOffscreenCanvasSupported: false,
      isImageDecoderSupported: false,
      useSystemFonts: true,
    });
    const pdf = await task.promise;
    const turns = [];
    for (let number = 1; number <= pdf.numPages; number += 1) {
      const page = await pdf.getPage(number);
      turns.push(await measurePage(page, worker, pdfjs, number));
    }
    return turns;
  } finally {
    await worker.terminate();
    await task?.destroy();
  }
}

async function measurePage(page, worker, pdfjs, number) {
  const image = await pageImage(page, pdfjs, number);
  const dpi = pageDpi(page, image);
  const primary = await readSample(image, page.rotate, dpi, worker, LONG_SIDE);
  let chosen = primary;
  if (primary.confidence < SURE) {
    const check = await readSample(image, page.rotate, dpi, worker, Math.round(LONG_SIDE / 2));
    const agreed = check.degrees === primary.degrees && primary.confidence >= MIN_CONFIDENCE;
    if (!agreed) throw unsure(number);
    chosen = primary.confidence >= check.confidence ? primary : check;
  }
  if (chosen.degrees == null || chosen.confidence < MIN_CONFIDENCE) throw unsure(number);
  console.log(`Страница ${number}: ещё ${chosen.degrees}°, уверенность ${chosen.confidence.toFixed(1)}.`);
  return chosen.degrees;
}

function unsure(number) {
  return new Error(`Не удалось уверенно определить поворот страницы ${number}.`);
}

async function readSample(image, rotation, dpi, worker, longest) {
  const sample = sampleRotated(image, rotation, longest);
  const canvas = createCanvas(sample.width, sample.height);
  const canvasContext = canvas.getContext('2d');
  canvasContext.putImageData(new ImageData(sample.rgba, sample.width, sample.height), 0, 0);
  const png = pngWithDpi(canvas.toBuffer('image/png'), Math.max(70, Math.round(dpi / sample.step)));
  const { data } = await worker.detect(png);
  return {
    degrees: data.orientation_degrees == null ? null : normalize(data.orientation_degrees),
    confidence: Number(data.orientation_confidence) || 0,
  };
}

async function pageImage(page, pdfjs, number) {
  const ops = await page.getOperatorList();
  let best = null;
  let bestArea = 0;
  for (let index = 0; index < ops.fnArray.length; index += 1) {
    const fn = ops.fnArray[index];
    if (fn !== pdfjs.OPS.paintImageXObject && fn !== pdfjs.OPS.paintJpegXObject) continue;
    const name = ops.argsArray[index][0];
    const image = await new Promise((resolve) => page.objs.get(name, resolve));
    if (!image?.data || !image.width || !image.height) continue;
    const area = image.width * image.height;
    if (area <= bestArea) continue;
    best = image;
    bestArea = area;
  }
  if (!best) throw new Error(`На странице ${number} нет изображения, по которому можно определить поворот.`);
  if (best.kind !== 2 && best.kind !== 3) {
    throw new Error(`Страница ${number} записана в формате, который бот не может повернуть.`);
  }
  return best;
}

function pageDpi(page, image) {
  const view = page.getViewport({ scale: 1 });
  const quarter = normalize(page.rotate) / 90;
  const rotatedW = quarter % 2 ? image.height : image.width;
  const rotatedH = quarter % 2 ? image.width : image.height;
  const dpiX = rotatedW / (view.width / 72);
  const dpiY = rotatedH / (view.height / 72);
  return (dpiX + dpiY) / 2;
}

function sampleRotated(image, rotation, longest) {
  const srcW = image.width;
  const srcH = image.height;
  const quarter = normalize(rotation) / 90;
  const fullW = quarter % 2 ? srcH : srcW;
  const fullH = quarter % 2 ? srcW : srcH;
  const step = Math.max(1, Math.ceil(Math.max(fullW, fullH) / longest));
  const dstW = Math.ceil(fullW / step);
  const dstH = Math.ceil(fullH / step);
  const rgba = new Uint8ClampedArray(dstW * dstH * 4);
  const src = image.data;
  const channels = image.kind === 3 ? 4 : 3;
  for (let y = 0; y < dstH; y += 1) {
    for (let x = 0; x < dstW; x += 1) {
      const fx = Math.min(fullW - 1, x * step);
      const fy = Math.min(fullH - 1, y * step);
      let sx;
      let sy;
      if (quarter === 1) {
        sx = fy;
        sy = srcH - 1 - fx;
      } else if (quarter === 2) {
        sx = srcW - 1 - fx;
        sy = srcH - 1 - fy;
      } else if (quarter === 3) {
        sx = srcW - 1 - fy;
        sy = fx;
      } else {
        sx = fx;
        sy = fy;
      }
      const si = (sy * srcW + sx) * channels;
      const gray = channels === 1
        ? src[si]
        : Math.round(src[si] * 0.3 + src[si + 1] * 0.59 + src[si + 2] * 0.11);
      const di = (y * dstW + x) * 4;
      rgba[di] = gray;
      rgba[di + 1] = gray;
      rgba[di + 2] = gray;
      rgba[di + 3] = 255;
    }
  }
  return { rgba, width: dstW, height: dstH, step };
}

function pngWithDpi(png, dpi) {
  const ppm = Math.round(dpi / 0.0254);
  const body = Buffer.alloc(13);
  body.write('pHYs', 0, 'latin1');
  body.writeUInt32BE(ppm, 4);
  body.writeUInt32BE(ppm, 8);
  body.writeUInt8(1, 12);
  const chunk = Buffer.alloc(21);
  chunk.writeUInt32BE(9, 0);
  body.copy(chunk, 4);
  chunk.writeUInt32BE(crc32(body), 17);
  return Buffer.concat([png.subarray(0, 33), chunk, png.subarray(33)]);
}

function crc32(buf) {
  let crc = ~0;
  for (let index = 0; index < buf.length; index += 1) {
    crc ^= buf[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

async function rewrite(bytes, turns) {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = doc.getPages();
  let changed = false;
  pages.forEach((page, index) => {
    const current = normalize(page.getRotation().angle);
    const next = normalize(current + (turns[index] ?? 0));
    if (next === current) return;
    page.setRotation(degrees(next));
    changed = true;
  });
  if (!changed) return Buffer.from(bytes);
  return Buffer.from(await doc.save());
}
