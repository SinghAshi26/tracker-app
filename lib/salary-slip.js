import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';
import { isIP } from 'node:net';

const PAGE_W = 595, PAGE_H = 842, LEFT = 38, RIGHT = 557, CONTENT_W = RIGHT - LEFT;
const BRAND = [20 / 255, 125 / 255, 100 / 255], INK = [22 / 255, 58 / 255, 51 / 255], MUTED = [120 / 255, 135 / 255, 128 / 255], BORDER = [220 / 255, 230 / 255, 224 / 255];
let fontPromise;
function loadFont() {
  if (!fontPromise) fontPromise = readFile(path.join(process.cwd(), 'assets/fonts/NotoSans-Regular.ttf')).catch(error => { fontPromise = null; throw error; });
  return fontPromise;
}
function fontMetrics(bytes) {
  const tables = {};
  for (let i = 0; i < bytes.readUInt16BE(4); i++) { const p = 12 + i * 16; tables[bytes.toString('ascii', p, p + 4)] = bytes.readUInt32BE(p + 8); }
  const units = bytes.readUInt16BE(tables.head + 18), metricsCount = bytes.readUInt16BE(tables.hhea + 34), scale = value => Math.round(value * 1000 / units);
  let cmap;
  for (let i = 0; i < bytes.readUInt16BE(tables.cmap + 2); i++) { const p = tables.cmap + 4 + i * 8, subtable = tables.cmap + bytes.readUInt32BE(p + 4); if (bytes.readUInt16BE(subtable) === 4) { cmap = subtable; break; } }
  if (!cmap) throw new Error('PDF font has no supported Unicode character map');
  const segments = bytes.readUInt16BE(cmap + 6) / 2, end = cmap + 14, start = end + segments * 2 + 2, delta = start + segments * 2, range = delta + segments * 2;
  function glyph(code) {
    if (code > 0xffff) return 0;
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
  return { glyph, width: gid => scale(bytes.readUInt16BE(tables.hmtx + Math.min(gid, metricsCount - 1) * 4)), bbox: [36, 38, 40, 42].map(p => scale(bytes.readInt16BE(tables.head + p))), ascent: scale(bytes.readInt16BE(tables.hhea + 4)), descent: scale(bytes.readInt16BE(tables.hhea + 6)) };
}
const hex16 = number => number.toString(16).padStart(4, '0');
const unicodeHex = value => Buffer.from(value, 'utf16le').swap16().toString('hex');
const moneyNumber = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const moneyText = (value, hasRupee) => `${hasRupee ? '₹' : 'Rs.'} ${moneyNumber(value).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const roundMoney = value => Math.round((moneyNumber(value) + Number.EPSILON) * 100) / 100;

function wordsBelowThousand(value) {
  const ones = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  let result = '';
  if (value >= 100) { result += `${ones[Math.floor(value / 100)]} Hundred`; value %= 100; }
  if (value >= 20) { result += `${result ? ' ' : ''}${tens[Math.floor(value / 10)]}`; value %= 10; }
  if (value > 0) result += `${result ? ' ' : ''}${ones[value]}`;
  return result;
}
export function amountInIndianWords(value) {
  let paiseTotal = Math.round(Math.abs(moneyNumber(value)) * 100), rupees = Math.floor(paiseTotal / 100), paise = paiseTotal % 100;
  const parts = [];
  for (const [unit, divisor] of [['Crore', 10000000], ['Lakh', 100000], ['Thousand', 1000]]) {
    const count = Math.floor(rupees / divisor);
    if (count) { parts.push(`${wordsBelowThousand(count)} ${unit}`); rupees %= divisor; }
  }
  if (rupees) parts.push(wordsBelowThousand(rupees));
  if (!parts.length) parts.push('Zero');
  const sign = Number(value) < 0 ? 'Minus ' : '';
  return `${sign}${parts.join(' ')} Rupees${paise ? ` and ${wordsBelowThousand(paise)} Paise` : ''} Only`;
}

function asDate(value) { const date = value instanceof Date ? value : new Date(value); return Number.isNaN(date.getTime()) ? null : date; }
function dateText(value) {
  if (!value) return 'Not provided';
  const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00Z`) : asDate(value);
  return date ? new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date) : 'Not provided';
}
function creditedText(value) {
  const date = asDate(value);
  return date ? `${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date)}, ${new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }).format(date)} IST` : 'Not provided';
}
function monthText(value, options = { month: 'long', year: 'numeric', timeZone: 'UTC' }) {
  const [year, month] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', options).format(new Date(Date.UTC(year, month - 1, 1)));
}
function companyDetails(organization = {}) {
  return [
    organization.address || process.env.COMPANY_ADDRESS || '',
    organization.phone || process.env.COMPANY_PHONE || '',
    organization.email || process.env.COMPANY_EMAIL || '',
    organization.website || 'appnix.info',
    organization.gstin || ''
  ].filter(Boolean);
}

function isPublicLogoHost(host) {
  const clean = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (clean === 'localhost' || clean.endsWith('.localhost') || clean.endsWith('.local')) return false;
  if (isIP(clean) === 4) {
    const octets = clean.split('.').map(Number);
    return !(octets[0] === 10 || octets[0] === 127 || octets[0] === 0 || (octets[0] === 169 && octets[1] === 254) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) || (octets[0] === 192 && octets[1] === 168));
  }
  if (isIP(clean) === 6) return clean === '::1' || clean.startsWith('fc') || clean.startsWith('fd') || clean.startsWith('fe80') ? false : true;
  return true;
}
async function fetchLogo(urlText) {
  if (!urlText) {
    try {
      const local = await readFile(path.join(process.cwd(), 'public/company-logo.png'));
      if (local.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return pngImage(local);
      if (local[0] === 0xff && local[1] === 0xd8) return jpegImage(local);
    } catch {}
    return null;
  }
  try {
    const url = new URL(urlText);
    if (url.protocol !== 'https:' || !isPublicLogoHost(url.hostname)) return null;
    const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(2500), headers: { Accept: 'image/png,image/jpeg' } });
    if (!response.ok || Number(response.headers.get('content-length')) > 1024 * 1024) return null;
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > 1024 * 1024) return null;
    if (data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return pngImage(data);
    if (data[0] === 0xff && data[1] === 0xd8) return jpegImage(data);
  } catch {}
  return null;
}
function jpegImage(data) {
  let p = 2, width = 0, height = 0;
  while (p + 9 < data.length) {
    if (data[p++] !== 0xff) continue;
    const marker = data[p++], length = data.readUInt16BE(p);
    if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) { height = data.readUInt16BE(p + 3); width = data.readUInt16BE(p + 5); break; }
    p += length;
  }
  if (!width || !height || width > 1200 || height > 1200) return null;
  return { data, width, height, colorSpace: '/DeviceRGB', filter: '/DCTDecode' };
}
function pngImage(data) {
  let p = 8, width, height, depth, color, interlace; const chunks = [];
  while (p + 12 <= data.length) {
    const length = data.readUInt32BE(p), type = data.toString('ascii', p + 4, p + 8), body = data.subarray(p + 8, p + 8 + length);
    if (type === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; color = body[9]; interlace = body[12]; }
    if (type === 'IDAT') chunks.push(body);
    p += 12 + length; if (type === 'IEND') break;
  }
  if (!width || !height || width > 1200 || height > 1200 || depth !== 8 || ![2, 6].includes(color) || interlace !== 0 || !chunks.length) return null;
  const channels = color === 6 ? 4 : 3, stride = width * channels, raw = inflateSync(Buffer.concat(chunks));
  if (raw.length !== height * (stride + 1)) return null;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)], input = y * (stride + 1) + 1, output = y * stride;
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? pixels[output + x - channels] : 0, up = y ? pixels[output + x - stride] : 0, upperLeft = y && x >= channels ? pixels[output + x - stride - channels] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = Math.floor((left + up) / 2);
      else if (filter === 4) { const base = left + up - upperLeft, dl = Math.abs(base - left), du = Math.abs(base - up), dul = Math.abs(base - upperLeft); predictor = dl <= du && dl <= dul ? left : du <= dul ? up : upperLeft; }
      else if (filter !== 0) return null;
      pixels[output + x] = (raw[input + x] + predictor) & 255;
    }
  }
  let imageData;
  if (channels === 3) imageData = pixels;
  else {
    imageData = Buffer.alloc(height * width * 3);
    for (let i = 0, j = 0; i < pixels.length; i += 4, j += 3) {
      const alpha = pixels[i + 3];
      for (let channel = 0; channel < 3; channel++) imageData[j + channel] = Math.round((pixels[i + channel] * alpha + 255 * (255 - alpha)) / 255);
    }
  }
  return { data: deflateSync(imageData), width, height, colorSpace: '/DeviceRGB', filter: '/FlateDecode' };
}

function normalizePayment(payment, employee = {}) {
  const s = payment.snapshot || {}, month = payment.month;
  const monthlySalary = moneyNumber(s.monthlySalary ?? employee.monthlySalary);
  const grossSalary = moneyNumber(s.grossSalary), advances = moneyNumber(s.advances);
  const rebateDays = moneyNumber(s.rebateDays), halfDays = moneyNumber(s.halfDays), leaveDays = moneyNumber(s.leaveDays), absentDays = moneyNumber(s.absentDays);
  return {
    employeeCode: s.employeeCode || employee.employeeCode || 'Not provided', employeeName: s.employeeName || employee.name || 'Employee',
    phone: s.phone || s.employeePhone || employee.phone || 'Not provided', joiningDate: s.joiningDate || employee.joiningDate || '',
    monthlySalary, perDayRate: moneyNumber(s.perDayRate), presentDays: moneyNumber(s.presentDays), halfDays,
    leaveDays, absentDays, sundayPaidDays: moneyNumber(s.sundayPaidDays), rebateDays,
    rebateAmount: moneyNumber(s.rebateAmount), grossSalary, advances, netSalary: moneyNumber(s.netSalary),
    daysInMonth: Number.isFinite(Number(s.daysInMonth)) && Number(s.daysInMonth) > 0 ? Number(s.daysInMonth) : new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate(),
    unpaidDays: s.unpaidDays == null ? Math.max(0, leaveDays + absentDays - rebateDays + halfDays * 0.5) : moneyNumber(s.unpaidDays),
    unpaidDeduction: s.unpaidDeduction == null ? Math.max(0, monthlySalary - grossSalary) : moneyNumber(s.unpaidDeduction),
    totalDeductions: s.totalDeductions == null ? advances : moneyNumber(s.totalDeductions)
  };
}

export async function createSalarySlip(payment, { employee = {}, organization = {} } = {}) {
  const font = await loadFont(), metrics = fontMetrics(font), s = normalizePayment(payment, employee), hasRupee = !!metrics.glyph('₹'.codePointAt(0));
  const objects = [], reserve = () => { objects.push(null); return objects.length; };
  const put = (id, value) => { objects[id - 1] = Buffer.isBuffer(value) ? value : Buffer.from(value, 'ascii'); };
  const stream = (id, data, extra = '') => {
    const compressed = deflateSync(Buffer.isBuffer(data) ? data : Buffer.from(data, 'ascii'));
    put(id, Buffer.concat([Buffer.from(`<< /Length ${compressed.length} /Filter /FlateDecode ${extra} >>\nstream\n`), compressed, Buffer.from('\nendstream')]));
  };
  const catalog = reserve(), pages = reserve(), page = reserve(), content = reserve(), type0 = reserve(), cidFont = reserve(), descriptor = reserve(), fontFile = reserve(), gidMap = reserve(), unicode = reserve();
  const logo = await fetchLogo(organization.logoUrl), logoId = logo ? reserve() : null;
  const chars = new Map(), commands = [];
  const safeText = value => [...String(value ?? '').replace(/[\r\n\t]/g, ' ')].map(c => metrics.glyph(c.codePointAt(0)) ? c : '?').join('');
  const measure = (value, size) => [...safeText(value)].reduce((sum, char) => sum + metrics.width(metrics.glyph(char.codePointAt(0))), 0) / 1000 * size;
  function wrap(value, maxWidth, size) {
    const words = safeText(value).split(/\s+/).filter(Boolean), lines = []; let line = '';
    for (let word of words) {
      if (measure(word, size) > maxWidth) {
        if (line) { lines.push(line); line = ''; }
        let part = '';
        for (const character of word) { if (part && measure(part + character, size) > maxWidth) { lines.push(part); part = ''; } part += character; }
        line = part; continue;
      }
      const next = line ? `${line} ${word}` : word;
      if (measure(next, size) > maxWidth && line) { lines.push(line); line = word; } else line = next;
    }
    if (line || !lines.length) lines.push(line);
    return lines;
  }
  function text(value, x, y, size = 9, color = INK, maxWidth = CONTENT_W, align = 'left') {
    const lines = wrap(value, maxWidth, size);
    lines.forEach((line, i) => {
      const width = measure(line, size), left = align === 'center' ? x - width / 2 : align === 'right' ? x - width : x;
      const encoded = [...line].map(char => { if (!chars.has(char)) chars.set(char, { cid: chars.size + 1, gid: metrics.glyph(char.codePointAt(0)) }); return hex16(chars.get(char).cid); }).join('');
      commands.push(`${color.map(v => v.toFixed(3)).join(' ')} rg BT /F1 ${size.toFixed(2)} Tf 1 0 0 1 ${left.toFixed(2)} ${(y - i * (size + 2)).toFixed(2)} Tm <${encoded}> Tj ET`);
    });
    return lines.length;
  }
  function rect(x, y, width, height, fill = null, stroke = BORDER, lineWidth = 0.7) {
    if (fill) commands.push(`${fill.map(v => v.toFixed(3)).join(' ')} rg ${x} ${y} ${width} ${height} re f`);
    if (stroke) commands.push(`${stroke.map(v => v.toFixed(3)).join(' ')} RG ${lineWidth} w ${x} ${y} ${width} ${height} re S`);
  }
  function line(x1, y1, x2, y2, color = BORDER, width = 0.7) { commands.push(`${color.map(v => v.toFixed(3)).join(' ')} RG ${width} w ${x1} ${y1} m ${x2} ${y2} l S`); }
  function section(title, y) { text(title, LEFT, y, 10.2, BRAND); line(LEFT, y - 6, RIGHT, y - 6, BORDER, 0.7); return y - 17; }
  function gridCells(pairs, top, columns, cellWidth, valueWidth, valueSize = 8.4) {
    let y = top;
    for (let i = 0; i < pairs.length; i += columns) {
      const group = pairs.slice(i, i + columns);
      const wrapped = group.map(([, value]) => wrap(value, valueWidth, valueSize));
      const rowHeight = Math.max(34, ...wrapped.map(lines => 17 + lines.length * (valueSize + 2)));
      group.forEach(([label, value], index) => {
        const x = LEFT + index * cellWidth;
        rect(x, y - rowHeight, cellWidth, rowHeight, null, BORDER, 0.65);
        text(label, x + 9, y - 11, 7, MUTED, cellWidth - 18);
        text(value, x + 9, y - 25, valueSize, INK, valueWidth);
      });
      if (group.length < columns) rect(LEFT + group.length * cellWidth, y - rowHeight, cellWidth, rowHeight, null, BORDER, 0.65);
      y -= rowHeight;
    }
    return y;
  }
  function pairedMetrics(pairs, top, rows, leftWidth) {
    const rowHeight = 18, cellWidth = CONTENT_W / 2; let y = top;
    for (let i = 0; i < rows; i++) {
      const first = pairs[i * 2], second = pairs[i * 2 + 1];
      [[first, LEFT], [second, LEFT + cellWidth]].forEach(([pair, x]) => {
        if (!pair) return;
        rect(x, y - rowHeight, cellWidth, rowHeight, null, BORDER, 0.55);
        text(pair[0], x + 7, y - 12, 7.4, MUTED, leftWidth);
        text(pair[1], x + cellWidth - 7, y - 12, 8.1, INK, cellWidth - leftWidth - 16, 'right');
      });
      y -= rowHeight;
    }
    return y;
  }
  function summaryColumn(x, top, width, heading, rows, rowHeight = 22) {
    rect(x, top - 18, width, 18, BRAND, BRAND, 0.5);
    text(heading, x + 8, top - 12, 8, [1, 1, 1], width - 16);
    let y = top - 18;
    rows.forEach(([label, value]) => {
      rect(x, y - rowHeight, width, rowHeight, null, BORDER, 0.55);
      text(label, x + 7, y - 9, 7.3, INK, width - 87);
      text(value, x + width - 7, y - 9, 7.3, INK, 73, 'right');
      y -= rowHeight;
    });
    return y;
  }

  const companyName = organization.companyName || 'Appnix Technologies', details = companyDetails(organization), logoBox = 64;
  let headerY = 800;
  headerY -= (text(companyName, LEFT, headerY, 18, BRAND, CONTENT_W - 85) - 1) * 20;
  details.forEach(detail => { headerY -= 13; const lines = text(detail, LEFT, headerY, 8.2, MUTED, CONTENT_W - 85); headerY -= (lines - 1) * 10; });
  if (logo) {
    const scale = Math.min(logoBox / logo.width, 52 / logo.height), w = logo.width * scale, h = logo.height * scale;
    const imageY = 800 - h;
    commands.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${(RIGHT - w).toFixed(2)} ${imageY.toFixed(2)} cm /Logo Do Q`);
  }
  const dividerY = Math.min(748, headerY - 9);
  line(LEFT, dividerY, RIGHT, dividerY, BRAND, 0.9);
  const titleTop = dividerY - 22;
  text('SALARY SLIP', PAGE_W / 2, titleTop, 15, BRAND, CONTENT_W, 'center');
  text(`For the month of ${monthText(payment.month)}`, PAGE_W / 2, titleTop - 18, 9, MUTED, CONTENT_W, 'center');

  let y = section('A. EMPLOYEE DETAILS', titleTop - 40);
  const [year, month] = payment.month.split('-').map(Number), daysInMonth = s.daysInMonth;
  const startDate = `1 ${monthText(payment.month, { month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(/ \d{4}$/, '')} ${year}`;
  const endDate = `${daysInMonth} ${monthText(payment.month, { month: 'short', year: 'numeric', timeZone: 'UTC' }).replace(/ \d{4}$/, '')} ${year}`;
  const info = [
    ['Employee ID', s.employeeCode], ['Employee Name', s.employeeName], ['Phone', s.phone || 'Not provided'],
    ['Date of Joining', dateText(s.joiningDate)], ['Pay Period', `${startDate} - ${endDate}`],
    ['Salary Credited On', creditedText(payment.creditedAt)], ['Payment Status', 'Credited']
  ];
  y = gridCells(info, y, 2, CONTENT_W / 2, CONTENT_W / 2 - 18, 8.2) - 17;

  y = section('B. ATTENDANCE & DAYS SUMMARY', y);
  const halfPaid = s.halfDays * 0.5, totalPaidDays = s.presentDays + halfPaid + s.sundayPaidDays + s.rebateDays;
  const metricPairs = [
    ['Total days in month', String(s.daysInMonth)], ['Present days', String(s.presentDays)],
    ['Half days', String(s.halfDays)], ['Paid Sundays (weekly off)', String(s.sundayPaidDays)],
    ['Leave days', String(s.leaveDays)], ['Absent days', String(s.absentDays)],
    ['Rebate days', String(s.rebateDays)], ['Total Paid Days', String(totalPaidDays)], ['Unpaid Days', String(s.unpaidDays)]
  ];
  y = pairedMetrics(metricPairs, y, 5, 135) - 17;

  y = section('C. SALARY SUMMARY', y);
  const gap = 10, colWidth = (CONTENT_W - gap) / 2;
  const earnedRows = [
    ['Monthly Salary (full month)', moneyText(s.monthlySalary, hasRupee)], ['Per-day rate', moneyText(s.perDayRate, hasRupee)],
    ['Earned salary for paid days', moneyText(s.grossSalary, hasRupee)], ['Rebate amount (included above)', moneyText(s.rebateAmount, hasRupee)]
  ];
  const deductionRows = [
    [`Unpaid days deduction (${s.unpaidDays} unpaid days)`, moneyText(s.unpaidDeduction, hasRupee)],
    ['Advances deducted', moneyText(s.advances, hasRupee)], ['Total deductions (advances)', moneyText(s.totalDeductions, hasRupee)]
  ];
  const leftEnd = summaryColumn(LEFT, y, colWidth, 'EARNINGS', earnedRows, 22);
  const rightEnd = summaryColumn(LEFT + colWidth + gap, y, colWidth, 'DEDUCTIONS', deductionRows, 22);
  y = Math.min(leftEnd, rightEnd) - 14;

  const boxHeight = 78;
  rect(LEFT, y - boxHeight, CONTENT_W, boxHeight, [0.925, 0.965, 0.945], BRAND, 0.9);
  text('Gross Salary (earned)', LEFT + 12, y - 17, 8.2, INK, CONTENT_W / 2);
  text(moneyText(s.grossSalary, hasRupee), RIGHT - 12, y - 17, 8.4, INK, CONTENT_W / 2, 'right');
  text('Total Deductions (advances)', LEFT + 12, y - 33, 8.2, INK, CONTENT_W / 2);
  text(moneyText(s.totalDeductions, hasRupee), RIGHT - 12, y - 33, 8.4, INK, CONTENT_W / 2, 'right');
  line(LEFT + 10, y - 40, RIGHT - 10, y - 40, [0.72, 0.84, 0.78], 0.6);
  text('NET SALARY CREDITED', LEFT + 12, y - 56, 11, BRAND, CONTENT_W / 2);
  text(moneyText(s.netSalary, hasRupee), RIGHT - 12, y - 58, 13, BRAND, CONTENT_W / 2, 'right');
  text(amountInIndianWords(s.netSalary), LEFT + 12, y - 70, 7.1, MUTED, CONTENT_W - 24);
  y -= boxHeight + 12;
  text(`Salary received vs total: Received ${moneyText(s.netSalary, hasRupee)} out of ${moneyText(s.monthlySalary, hasRupee)} monthly salary`, PAGE_W / 2, y, 7.7, INK, CONTENT_W, 'center');

  const footer = [
    'This is a computer-generated salary slip and does not require a physical signature or stamp.',
    'This slip reflects the calculation frozen at the time the salary was credited.',
    `Generated on ${dateText(new Date())} · Amounts are in Indian Rupees (INR).`
  ];
  footer.forEach((value, index) => text(value, PAGE_W / 2, 52 - index * 12, 7.1, MUTED, CONTENT_W, 'center'));

  stream(content, commands.join('\n'));
  stream(fontFile, font, `/Length1 ${font.length}`);
  const mapping = Buffer.alloc((chars.size + 1) * 2), widths = [], mappings = [];
  for (const [char, { cid, gid }] of chars) { mapping.writeUInt16BE(gid, cid * 2); widths.push(metrics.width(gid)); mappings.push(`<${hex16(cid)}> <${unicodeHex(char)}>`); }
  stream(gidMap, mapping);
  const batches = [];
  for (let i = 0; i < mappings.length; i += 100) { const batch = mappings.slice(i, i + 100); batches.push(`${batch.length} beginbfchar\n${batch.join('\n')}\nendbfchar`); }
  stream(unicode, `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> def\n/CMapName /AppnixUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <ffff>\nendcodespacerange\n${batches.join('\n')}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`);
  put(descriptor, `<< /Type /FontDescriptor /FontName /NotoSans /Flags 32 /FontBBox [${metrics.bbox.join(' ')}] /ItalicAngle 0 /Ascent ${metrics.ascent} /Descent ${metrics.descent} /CapHeight ${metrics.ascent} /StemV 80 /FontFile2 ${fontFile} 0 R >>`);
  put(cidFont, `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /NotoSans /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptor} 0 R /CIDToGIDMap ${gidMap} 0 R /W [1 [${widths.join(' ')}]] >>`);
  put(type0, `<< /Type /Font /Subtype /Type0 /BaseFont /NotoSans /Encoding /Identity-H /DescendantFonts [${cidFont} 0 R] /ToUnicode ${unicode} 0 R >>`);
  if (logoId) {
    const data = logo.filter === '/DCTDecode' ? logo.data : logo.data;
    const imageData = logo.filter === '/FlateDecode' ? data : data;
    const compressed = logo.filter === '/DCTDecode' ? imageData : imageData;
    put(logoId, Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace ${logo.colorSpace} /BitsPerComponent 8 /Filter ${logo.filter} /Length ${compressed.length} >>\nstream\n`), compressed, Buffer.from('\nendstream')]));
  }
  const xObject = logoId ? ` /XObject << /Logo ${logoId} 0 R >>` : '';
  put(page, `<< /Type /Page /Parent ${pages} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 ${type0} 0 R >>${xObject} >> /Contents ${content} 0 R >>`);
  put(pages, `<< /Type /Pages /Kids [${page} 0 R] /Count 1 >>`);
  put(catalog, `<< /Type /Catalog /Pages ${pages} 0 R >>`);
  const parts = [Buffer.from('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n', 'latin1')], offsets = [0]; let position = parts[0].length;
  objects.forEach((value, index) => { offsets.push(position); const part = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), value, Buffer.from('\nendobj\n')]); parts.push(part); position += part.length; });
  parts.push(Buffer.from(`xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${position}\n%%EOF\n`));
  return Buffer.concat(parts);
}
