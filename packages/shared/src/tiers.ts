export type TierId = 'casual' | 'pro' | 'enterprise';

export interface Tier {
  id: TierId;
  label: string;
  priceInr: number;
  dailyTokenCap: number;
  monthlyInrCap: number;
  description: string;
}

export const TIERS: Tier[] = [
  {
    id: 'casual',
    label: 'Casual',
    priceInr: 0,
    dailyTokenCap: 50_000,
    monthlyInrCap: 50,
    description: 'Free tier — great for trying out Nano Bricks',
  },
  {
    id: 'pro',
    label: 'Pro',
    priceInr: 499,
    dailyTokenCap: 500_000,
    monthlyInrCap: 500,
    description: 'For power users who need more every day',
  },
  {
    id: 'enterprise',
    label: 'Enterprise',
    priceInr: 1999,
    dailyTokenCap: 5_000_000,
    monthlyInrCap: 2000,
    description: 'Full power — for teams and heavy workflows',
  },
];
