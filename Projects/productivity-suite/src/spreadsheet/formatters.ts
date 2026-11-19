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
    default:
      if (typeof value === 'number') {
        // Round very small precision errors
        return String(Math.round(value * 1e10) / 1e10);
      }
      return String(value);
  }
}
