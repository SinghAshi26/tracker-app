import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

// Small PDF 1.7 writer with an embedded TrueType font. No browser, network,
// native executable, or new runtime dependency is required on Vercel.
let fontPromise;
function loadFont() {
  if (!fontPromise) fontPromise = readFile(path.join(process.cwd(), 'assets/fonts/NotoSans-Regular.ttf')).catch(error => { fontPromise = null; throw error; });
  return fontPromise;
}
function fontMetrics(bytes) {
  const tables = {};
  for (let i = 0; i < bytes.readUInt16BE(4); i++) {
    const p = 12 + i * 16;
    tables[bytes.toString('ascii', p, p + 4)] = bytes.readUInt32BE(p + 8);
  }
  const units = bytes.readUInt16BE(tables.head + 18), metricsCount = bytes.readUInt16BE(tables.hhea + 34);
  const scale = value => Math.round(value * 1000 / units);
  let cmap;
  for (let i = 0; i < bytes.readUInt16BE(tables.cmap + 2); i++) {
    const p = tables.cmap + 4 + i * 8, subtable = tables.cmap + bytes.readUInt32BE(p + 4);
    if (bytes.readUInt16BE(subtable) === 4) { cmap = subtable; break; }
  }
  if (!cmap) throw new Error('PDF font has no supported Unicode character map');
  const segments = bytes.readUInt16BE(cmap + 6) / 2;
  const end = cmap + 14, start = end + segments * 2 + 2, delta = start + segments * 2, range = delta + segments * 2;
  function glyph(code) {
    for (let i = 0; i < segments; i++) {
      if (code > bytes.readUInt16BE(end + i * 2)) continue;
      if (code < bytes.readUInt16BE(start + i * 2)) return 0;
      const offset = bytes.readUInt16BE(range + i * 2), change = bytes.readInt16BE(delta + i * 2);
      if (!offset) return (code + change) & 0xffff;
      const value = bytes.readUInt16BE(range + i * 2 + offset + 2 * (code - bytes.readUInt16BE(start + i * 2)));
      return value ? (value + change) & 0xffff : 0;
    }
    return 0;
  }
  return {
    glyph, width: gid => scale(bytes.readUInt16BE(tables.hmtx + Math.min(gid, metricsCount - 1) * 4)),
    bbox: [36, 38, 40, 42].map(p => scale(bytes.readInt16BE(tables.head + p))),
    ascent: scale(bytes.readInt16BE(tables.hhea + 4)), descent: scale(bytes.readInt16BE(tables.hhea + 6))
  };
}
const hex16 = number => number.toString(16).padStart(4, '0');
const unicodeHex = value => Buffer.from(value, 'utf16le').swap16().toString('hex');
export async function createSalarySlip(payment) {
  const font = await loadFont(), metrics = fontMetrics(font), s = payment.snapshot;
  const objects = [], reserve = () => { objects.push(null); return objects.length; };
  const put = (id, value) => { objects[id - 1] = Buffer.isBuffer(value) ? value : Buffer.from(value, 'ascii'); };
  const stream = (id, data, extra = '') => {
    const compressed = deflateSync(Buffer.isBuffer(data) ? data : Buffer.from(data, 'ascii'));
    put(id, Buffer.concat([Buffer.from(`<< /Length ${compressed.length} /Filter /FlateDecode ${extra} >>\nstream\n`), compressed, Buffer.from('\nendstream')]));
  };
  const catalog = reserve(), pages = reserve(), page = reserve(), content = reserve(), type0 = reserve(), cidFont = reserve(), descriptor = reserve(), fontFile = reserve(), gidMap = reserve(), unicode = reserve();
  const chars = new Map(), commands = [];
  // The bundled Noto Latin font supports Latin names. Unsupported characters
  // remain explicit as U+XXXX codes, rather than silently disappearing.
  function safeText(value) {
    return [...String(value ?? '').replace(/[\r\n\t]/g, ' ')].map(c => metrics.glyph(c.codePointAt(0)) ? c : `[U+${c.codePointAt(0).toString(16).toUpperCase()}]`).join('');
  }
  function draw(value, x, y, size = 11, maxWidth = 495) {
    const text = safeText(value);
    const width = [...text].reduce((sum, c) => sum + metrics.width(metrics.glyph(c.codePointAt(0))), 0) / 1000 * size;
    const fittedSize = width > maxWidth ? size * maxWidth / width : size;
    const encoded = [...text].map(c => {
      if (!chars.has(c)) chars.set(c, { cid: chars.size + 1, gid: metrics.glyph(c.codePointAt(0)) });
      return hex16(chars.get(c).cid);
    }).join('');
    commands.push(`BT /F1 ${fittedSize.toFixed(3)} Tf 1 0 0 1 ${x} ${y} Tm <${encoded}> Tj ET`);
  }
  const money = value => `INR ${Number(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  draw('Appnix Technologies', 50, 785, 21);
  draw('SALARY SLIP', 50, 755, 12);
  draw(`Employee: ${s.employeeName}`, 50, 719);
  draw(`Phone: ${s.employeePhone || '-'}`, 50, 696);
  draw(`Month: ${payment.month}`, 50, 673);
  draw(`Credited: ${new Date(payment.creditedAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} (IST)`, 50, 650);
  commands.push('0.85 G 50 630 m 545 630 l S 0 g');
  const lines = [
    ['Per-day rate', money(s.perDayRate)], ['Present days', s.presentDays], ['Half days', s.halfDays],
    ['Leave days', s.leaveDays], ['Absent days', s.absentDays], ['Paid Sundays', s.sundayPaidDays],
    ['Rebate days', s.rebateDays], ['Rebate amount (included in gross)', money(s.rebateAmount)],
    ['Gross salary', money(s.grossSalary)], ['Advances deducted', money(s.advances)], ['Net salary credited', money(s.netSalary)]
  ];
  lines.forEach(([label, value], i) => { draw(label, 50, 601 - i * 29, 11, 300); draw(value, 370, 601 - i * 29, 11, 175); });
  draw('This slip reflects the calculation frozen when the salary was marked credited.', 50, 240, 9);
  draw('Amounts are in Indian rupees (INR).', 50, 222, 9);
  stream(content, commands.join('\n'));
  stream(fontFile, font, `/Length1 ${font.length}`);
  const mapping = Buffer.alloc((chars.size + 1) * 2);
  const widths = [], mappings = [];
  for (const [char, { cid, gid }] of chars) { mapping.writeUInt16BE(gid, cid * 2); widths.push(metrics.width(gid)); mappings.push(`<${hex16(cid)}> <${unicodeHex(char)}>`); }
  stream(gidMap, mapping);
  const batches = [];
  for (let i = 0; i < mappings.length; i += 100) { const batch = mappings.slice(i, i + 100); batches.push(`${batch.length} beginbfchar\n${batch.join('\n')}\nendbfchar`); }
  stream(unicode, `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /AppnixUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <ffff>\nendcodespacerange\n${batches.join('\n')}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`);
  put(descriptor, `<< /Type /FontDescriptor /FontName /NotoSans /Flags 32 /FontBBox [${metrics.bbox.join(' ')}] /ItalicAngle 0 /Ascent ${metrics.ascent} /Descent ${metrics.descent} /CapHeight ${metrics.ascent} /StemV 80 /FontFile2 ${fontFile} 0 R >>`);
  put(cidFont, `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /NotoSans /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptor} 0 R /CIDToGIDMap ${gidMap} 0 R /W [1 [${widths.join(' ')}]] >>`);
  put(type0, `<< /Type /Font /Subtype /Type0 /BaseFont /NotoSans /Encoding /Identity-H /DescendantFonts [${cidFont} 0 R] /ToUnicode ${unicode} 0 R >>`);
  put(page, `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${type0} 0 R >> >> /Contents ${content} 0 R >>`);
  put(pages, `<< /Type /Pages /Kids [${page} 0 R] /Count 1 >>`);
  put(catalog, `<< /Type /Catalog /Pages ${pages} 0 R >>`);
  const parts = [Buffer.from('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n', 'latin1')], offsets = [0];
  let position = parts[0].length;
  objects.forEach((value, index) => { offsets.push(position); const part = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), value, Buffer.from('\nendobj\n')]); parts.push(part); position += part.length; });
  parts.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${position}\n%%EOF\n`));
  return Buffer.concat(parts);
}
