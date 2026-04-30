import dayjs from 'dayjs';

export interface DeliveryRange {
  minDate: string;   // e.g. "Mon, 5 May"
  maxDate: string;   // e.g. "Wed, 7 May"
  minDays: number;
  maxDays: number;
}

/**
 * Parse delivery date text from Meesho and compute offset in business days.
 * Example input: "Delivery by Mon, 5 May" → offset 3-5 days
 */
export function parseDeliveryOffset(deliveryText: string): { min: number; max: number } {
  if (!deliveryText) return { min: 3, max: 7 };

  try {
    // Extract date from "Delivery by Mon, 5 May"
    const match = deliveryText.match(/(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
    if (match) {
      const [, day, month] = match;
      const targetDate = dayjs(`${day} ${month} ${dayjs().year()}`, 'D MMM YYYY');
      const today = dayjs();
      const diffDays = targetDate.diff(today, 'day');

      if (diffDays > 0) {
        return { min: Math.max(1, diffDays - 1), max: diffDays + 1 };
      }
    }
  } catch {
    // fall through to default
  }

  // Default for Indian domestic shipping
  return { min: 3, max: 7 };
}

/**
 * Calculate estimated delivery dates dynamically at request time.
 */
export function calculateDeliveryDate(minDays: number, maxDays: number): DeliveryRange {
  const now = dayjs();

  // Skip Sundays for business day calculation
  let minDate = now.clone();
  let daysAdded = 0;
  while (daysAdded < minDays) {
    minDate = minDate.add(1, 'day');
    if (minDate.day() !== 0) daysAdded++; // skip Sunday
  }

  let maxDate = now.clone();
  daysAdded = 0;
  while (daysAdded < maxDays) {
    maxDate = maxDate.add(1, 'day');
    if (maxDate.day() !== 0) daysAdded++;
  }

  return {
    minDate: minDate.format('ddd, D MMM'),
    maxDate: maxDate.format('ddd, D MMM'),
    minDays,
    maxDays,
  };
}
