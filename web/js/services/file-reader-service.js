// Stage 1: bytes -> source document. No region selection or building semantics.
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const readers = { pdf: readPdf, dxf: readDxf };
const fail = (code, message) => { throw Object.assign(new Error(message), { code }); };

export function supportedInputExtensions() {
  return Object.keys(readers);
}

export function validateFile(file) {
  if (!file || typeof file.name !== 'string' || typeof file.arrayBuffer !== 'function') {
    fail('E_INVALID_FILE', '請提供可讀取的圖面檔案。');
  }
  const format = /\.([^.]+)$/.exec(file.name)?.[1].toLowerCase();
  if (!Object.hasOwn(readers, format)) {
    fail('E_UNSUPPORTED_INPUT', `請選擇 ${supportedInputExtensions().map(s => s.toUpperCase()).join(' 或 ')} 檔案。目前尚未支援此副檔名。`);
  }
  if (file.size > MAX_FILE_BYTES) fail('E_FILE_TOO_LARGE', '檔案超過 50 MB，請先拆分或縮小檔案。');
  if (!Number.isFinite(file.size) || file.size <= 0) fail('E_EMPTY_FILE', '這個檔案是空的，請選擇有內容的圖面。');
  return format;
}

/** Browser File (also supported by Node). Caller owns dispose() after rendering finishes. */
export async function readFile(file, options = {}) {
  const format = validateFile(file);
  const buffer = await file.arrayBuffer();
  if (!buffer.byteLength) fail('E_EMPTY_FILE', '這個檔案是空的，請選擇有內容的圖面。');
  if (buffer.byteLength > MAX_FILE_BYTES) fail('E_FILE_TOO_LARGE', '檔案超過 50 MB，請先拆分或縮小檔案。');
  // Hash before PDF.js transfers the byte buffer to its worker.
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  const sha256 = Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
  const parsed = await readers[format](buffer, options);
  return { format, filename: file.name, size: buffer.byteLength || file.size, sha256, ...parsed };
}

async function readPdf(buffer, { pdfOptions = {} }) {
  const header = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 1024)));
  if (!header.includes('%PDF-')) fail('E_INVALID_PDF', '檔案內容不是有效的 PDF。');
  const pdfjs = await import('../../vendor/pdfjs/build/pdf.mjs');
  const root = new URL('../../vendor/pdfjs/', import.meta.url);
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('build/pdf.worker.mjs', root).href;
  const task = pdfjs.getDocument({
    cMapUrl: new URL('cmaps/', root).href, cMapPacked: true,
    standardFontDataUrl: new URL('standard_fonts/', root).href,
    wasmUrl: new URL('wasm/', root).href, ...pdfOptions,
    data: new Uint8Array(buffer), isEvalSupported: false,
  });
  let passwordProtected = false, disposal;
  const dispose = () => disposal ||= task.destroy();
  task.onPassword = () => { passwordProtected = true; void dispose().catch(() => {}); };
  try {
    return { document: await task.promise, dispose };
  } catch (error) {
    await dispose().catch(() => {});
    if (passwordProtected) fail('E_PDF_PASSWORD', '這份 PDF 有密碼保護。請先解除密碼後再匯入。');
    throw error;
  }
}

async function readDxf(buffer) {
  let text = new TextDecoder('utf-8').decode(buffer);
  if (text.startsWith('AutoCAD Binary DXF')) fail('E_BINARY_DXF', '目前支援文字格式 DXF，請先另存為 ASCII DXF。');
  if (text.includes('\uFFFD')) {
    const codepage = text.match(/\$DWGCODEPAGE\s+\d+\s+([^\r\n]+)/)?.[1]?.trim();
    const encoding = { ANSI_950: 'big5', ANSI_936: 'gbk', ANSI_932: 'shift_jis', ANSI_1252: 'windows-1252' }[codepage];
    if (encoding) text = new TextDecoder(encoding).decode(buffer);
  }
  if (!globalThis.DxfParser) fail('E_DXF_PARSER', 'DXF 解析器未載入，請重新整理後再試。');
  const document = new globalThis.DxfParser().parseSync(text);
  if (!document?.entities) fail('E_INVALID_DXF', '找不到有效的 DXF 圖元，請確認檔案格式。');
  return { document, dispose: async () => {} };
}
