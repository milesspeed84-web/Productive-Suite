export type NumberFormatType =
  | 'general'
  | 'number'
  | 'currency'
  | 'accounting'
  | 'percentage'
  | 'shortDate'
  | 'time'
  | 'scientific'
  | 'text';

function formatExcelDate(serial: number, format: string): string {
  const date = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000);
  if (isNaN(date.getTime())) return String(serial);
  const hasTime = /[hs]/i.test(format);
  const hour = date.getUTCHours();
  const replacements: Record<string, string> = {
    yyyy: String(date.getUTCFullYear()),
    yy: String(date.getUTCFullYear()).slice(-2),
    mmmm: date.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }),
    mmm: date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' }),
    mm: String(hasTime ? date.getUTCMinutes() : date.getUTCMonth() + 1).padStart(2, '0'),
    m: String(hasTime ? date.getUTCMinutes() : date.getUTCMonth() + 1),
    dddd: date.toLocaleString('en-US', { weekday: 'long', timeZone: 'UTC' }),
    ddd: date.toLocaleString('en-US', { weekday: 'short', timeZone: 'UTC' }),
    dd: String(date.getUTCDate()).padStart(2, '0'),
    d: String(date.getUTCDate()),
    hh: String(hasTime ? hour % 12 || 12 : hour).padStart(2, '0'),
    h: String(hasTime ? hour % 12 || 12 : hour),
    ss: String(date.getUTCSeconds()).padStart(2, '0'),
    s: String(date.getUTCSeconds()),
  };
  let pattern = format.split(';')[0].replace(/\[[^\]]+\]/g, '');
  const literals: string[] = [];
  pattern = pattern.replace(/"([^"]*)"/g, (_, literal: string) => {
    literals.push(literal);
    return `~LIT${literals.length - 1}~`;
  });
  pattern = pattern.replace(/AM\/PM/gi, hour >= 12 ? 'PM' : 'AM');
  pattern = pattern.replace(/yyyy|mmmm|dddd|mmm|ddd|yy|mm|dd|hh|ss|m|d|h|s/gi, token => {
    return replacements[token.toLowerCase()] ?? token;
  });
  return pattern.replace(/~LIT(\d+)~/g, (_, index: string) => literals[Number(index)]);
}

function formatExcelNumber(value: number, format: string): string | undefined {
  const section = format.split(';')[0];
  const bare = section.replace(/\[[^\]]+\]/g, '').replace(/"[^"]*"/g, '');
  if (/[ymdhs]/i.test(bare)) return formatExcelDate(value, section);

  const percent = bare.includes('%');
  const scaled = percent ? value * 100 : value;
  const decimalPart = bare.match(/\.([0#]+)/)?.[1] ?? '';
  const minimumDecimals = (decimalPart.match(/0/g) ?? []).length;
  const maximumDecimals = decimalPart.length;
  const integerFormat = bare.split('.')[0];
  const grouping = integerFormat.includes(',');
  const formatted = Math.abs(scaled).toLocaleString(undefined, {
    useGrouping: grouping,
    minimumFractionDigits: minimumDecimals,
    maximumFractionDigits: maximumDecimals,
  });
  const currency = section.match(/[$€£¥₹]/)?.[0];
  const negativeSection = format.split(';')[1] ?? '';
  const negative = scaled < 0;
  let result = `${currency ?? ''}${formatted}${percent ? '%' : ''}`;
  if (negative) result = negativeSection.includes('(') ? `(${result})` : `-${result}`;
  return result;
}

export function formatCellValue(value: string | number | boolean | undefined, format?: string, decimals = 2): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';

  const num = typeof value === 'number' ? value : parseFloat(String(value));
  const isNumeric = !isNaN(num) && isFinite(num) && (typeof value === 'number' || String(value).trim() === String(num));

  if (!isNumeric) {
    return String(value);
  }

  switch (format) {
    case 'number':
      return num.toLocaleString(undefined, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

    case 'currency':
      return num.toLocaleString(undefined, {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

    case 'accounting': {
      const formatted = Math.abs(num).toLocaleString(undefined, {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });
      return num < 0 ? `(${formatted})` : ` ${formatted} `;
    }

    case 'percentage':
      return `${(num * 100).toFixed(decimals)}%`;

    case 'shortDate': {
      // Excel serial date or ISO date
      const d = num > 20000 ? new Date((num - 25569) * 86400 * 1000) : new Date(num);
      return isNaN(d.getTime()) ? String(num) : d.toISOString().split('T')[0];
    }

    case 'time': {
      const d = new Date(num);
      return isNaN(d.getTime()) ? String(num) : d.toLocaleTimeString();
    }

    case 'scientific':
      return num.toExponential(decimals).toUpperCase();

    case 'text':
      return String(num);

    case 'general':
      if (typeof value === 'number') {
        // Round very small precision errors
        return String(Math.round(value * 1e10) / 1e10);
      }
      return String(value);
    default:
      if (typeof value === 'number' && format) {
        return formatExcelNumber(value, format) ?? String(value);
      }
      return String(value);
  }
}
