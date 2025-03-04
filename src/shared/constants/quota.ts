export const JOBSTASH_QUOTA: {
  [key: string]: {
    veri: number;
    stashPool: boolean;
    atsIntegration: boolean;
    boostedVacancyMultiplier: number;
  };
} = {
  starter: {
    veri: 10,
    stashPool: false,
    atsIntegration: true,
    boostedVacancyMultiplier: 0,
  },
  growth: {
    veri: 250,
    stashPool: true,
    atsIntegration: true,
    boostedVacancyMultiplier: 0,
  },
  pro: {
    veri: 500,
    stashPool: true,
    atsIntegration: true,
    boostedVacancyMultiplier: 1,
  },
  max: {
    veri: 1000,
    stashPool: true,
    atsIntegration: true,
    boostedVacancyMultiplier: 2,
  },
};

export const VERI_ADDONS: { [key: string]: number } = {
  lite: 100,
  plus: 250,
  elite: 500,
  ultra: 1000,
};
