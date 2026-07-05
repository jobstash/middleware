export const JOBSTASH_QUOTA: {
  [key: string]: {
    veri: number;
    stashPool: boolean;
    atsIntegration: boolean;
    jobPromotions: number;
  };
} = {
  starter: {
    veri: 10,
    stashPool: false,
    atsIntegration: false,
    jobPromotions: 0,
  },
  growth: {
    veri: 100,
    stashPool: true,
    atsIntegration: true,
    jobPromotions: 0,
  },
  pro: {
    veri: 500,
    stashPool: true,
    atsIntegration: true,
    jobPromotions: 2,
  },
  max: {
    veri: 1000,
    stashPool: true,
    atsIntegration: true,
    jobPromotions: 5,
  },
};

export const VERI_ADDONS: { [key: string]: number } = {
  lite: 100,
  plus: 250,
  elite: 500,
  ultra: 1000,
};
