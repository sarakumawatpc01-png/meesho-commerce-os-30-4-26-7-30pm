import { Site } from '../types';

export function calculateSellingPrice(meeshoPrice: number, site: Site): number {
  let price: number;

  if (site.markup_type === 'percent') {
    price = meeshoPrice * (1 + site.markup_value / 100);
  } else {
    price = meeshoPrice + site.markup_value;
  }

  // Apply rounding rule
  switch (site.rounding_rule) {
    case 'nearest_9':
      price = Math.floor(price / 10) * 10 + 9;
      break;
    case 'nearest_99':
      price = Math.floor(price / 100) * 100 + 99;
      break;
    case 'nearest_49':
      price = Math.floor(price / 50) * 50 + 49;
      break;
    default:
      price = Math.round(price);
  }

  return price;
}
