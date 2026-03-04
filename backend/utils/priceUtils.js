'use strict';

/**
 * Calculate the total rental cost for a listing over a date range.
 *
 * Pricing priority (highest discount first):
 *   1. Monthly rate — applied in 30-day blocks if price_per_month is set
 *   2. Weekly rate  — applied in 7-day blocks if price_per_week is set
 *   3. Daily rate   — applied to remaining days
 *
 * @param {object} listing          Listing row (or plain object with price fields)
 * @param {string|Date} startDate   Rental start (inclusive)
 * @param {string|Date} endDate     Rental end (exclusive — checkout day)
 * @returns {{
 *   total_days: number,
 *   price_per_day: number,
 *   effective_weekly_rate: number,
 *   effective_monthly_rate: number,
 *   subtotal: number,
 *   deposit_amount: number,
 *   total_charged: number,
 *   breakdown: string
 * }}
 */
function calculateRentalPrice(listing, startDate, endDate) {
  const start = new Date(startDate);
  const end   = new Date(endDate);

  const totalDays = Math.round((end - start) / (1000 * 60 * 60 * 24));
  if (totalDays <= 0) {
    throw new Error('End date must be after start date');
  }

  const ppd = parseFloat(listing.price_per_day);
  const ppw = listing.price_per_week  ? parseFloat(listing.price_per_week)  : null;
  const ppm = listing.price_per_month ? parseFloat(listing.price_per_month) : null;

  let remaining = totalDays;
  let subtotal  = 0;
  const parts   = [];

  // 1. Monthly blocks
  if (ppm !== null && remaining >= 30) {
    const months = Math.floor(remaining / 30);
    subtotal  += months * ppm;
    remaining -= months * 30;
    parts.push(`${months} month${months !== 1 ? 's' : ''}`);
  }

  // 2. Weekly blocks
  if (ppw !== null && remaining >= 7) {
    const weeks = Math.floor(remaining / 7);
    subtotal  += weeks * ppw;
    remaining -= weeks * 7;
    parts.push(`${weeks} week${weeks !== 1 ? 's' : ''}`);
  }

  // 3. Remaining days at daily rate
  if (remaining > 0) {
    subtotal += remaining * ppd;
    parts.push(`${remaining} day${remaining !== 1 ? 's' : ''}`);
  }

  const depositAmount = parseFloat(listing.security_deposit || listing.deposit_amount || 0);

  return {
    total_days:             totalDays,
    price_per_day:          round2(ppd),
    effective_weekly_rate:  round2(ppw  ?? ppd * 7),
    effective_monthly_rate: round2(ppm  ?? ppd * 30),
    subtotal:               round2(subtotal),
    deposit_amount:         round2(depositAmount),
    total_charged:          round2(subtotal),   // deposit collected separately at checkout
    breakdown:              parts.join(' + ') || '0 days',
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

module.exports = { calculateRentalPrice };
