export interface TaxResult {
  regime: 'old' | 'new';
  taxableIncome: number;
  taxPayable: number;
  slabs: { rate: number; amount: number; tax: number; range: string }[];
  standardDeduction: number;
  appliedDeductions: {
    section80C: number;
    section80D: number;
    section24: number;
    section80E: number;
    hra: number;
    nps: number;
    other: number;
    total: number;
  };
  rebate: number;
  cess: number;
  totalTax: number;
}

export const calculateTax = (
  income: number | {
    salary: number;
    houseProperty: number;
    capitalGains: number;
    businessIncome: number;
    otherIncome: number;
  },
  deductions: {
    section80C: number;
    section80D: number;
    section24: number;
    section80E: number;
    hra: number;
    nps: number;
    other: number;
  },
  regime: 'old' | 'new'
): TaxResult => {
  const inc = typeof income === 'number' ? { salary: income, houseProperty: 0, capitalGains: 0, businessIncome: 0, otherIncome: 0 } : income;
  const totalGross = (Number(inc.salary) || 0) + (Number(inc.houseProperty) || 0) + (Number(inc.capitalGains) || 0) + (Number(inc.businessIncome) || 0) + (Number(inc.otherIncome) || 0);
  
  let standardDeduction = 0;
  let applied = { section80C: 0, section80D: 0, section24: 0, section80E: 0, hra: 0, nps: 0, other: 0, total: 0 };
  let taxableIncome = 0;

  if (regime === 'new') {
    standardDeduction = Math.min(Number(inc.salary) || 0, 75000);
    taxableIncome = Math.max(0, totalGross - standardDeduction);
  } else {
    standardDeduction = Math.min(Number(inc.salary) || 0, 50000);
    applied.section80C = Math.min(Number(deductions.section80C) || 0, 150000);
    applied.section80D = Math.min(Number(deductions.section80D) || 0, 75000);
    applied.section24 = Math.min(Number(deductions.section24) || 0, 200000);
    applied.section80E = Number(deductions.section80E) || 0;
    applied.nps = Math.min(Number(deductions.nps) || 0, 50000);
    applied.hra = Number(deductions.hra) || 0;
    applied.other = Number(deductions.other) || 0;
    applied.total = applied.section80C + applied.section80D + applied.section24 + applied.section80E + applied.nps + applied.hra + applied.other;
    taxableIncome = Math.max(0, totalGross - standardDeduction - applied.total);
  }

  taxableIncome = Math.round(taxableIncome / 10) * 10;
  
  let baseTax = 0;
  const slabs: { rate: number; amount: number; tax: number; range: string }[] = [];
  const limits = regime === 'new' ? [300000, 700000, 1000000, 1200000, 1500000] : [250000, 500000, 1000000];
  const rates = regime === 'new' ? [0, 0.05, 0.10, 0.15, 0.20, 0.30] : [0, 0.05, 0.20, 0.30];

  let remaining = taxableIncome;
  let prevLimit = 0;
  for (let i = 0; i < limits.length; i++) {
    const slabSize = limits[i] - prevLimit;
    const taxableInSlab = Math.min(remaining, slabSize);
    if (taxableInSlab > 0) {
      const slabTax = taxableInSlab * rates[i];
      baseTax += slabTax;
      slabs.push({ 
        rate: rates[i] * 100, 
        amount: taxableInSlab, 
        tax: Math.round(slabTax), 
        range: `₹${(prevLimit / 100000).toFixed(1)}L - ₹${(limits[i] / 100000).toFixed(1)}L` 
      });
      remaining -= taxableInSlab;
    }
    prevLimit = limits[i];
  }
  if (remaining > 0) {
    const slabTax = remaining * rates[rates.length - 1];
    baseTax += slabTax;
    slabs.push({ 
      rate: rates[rates.length - 1] * 100, 
      amount: remaining, 
      tax: Math.round(slabTax), 
      range: `Above ₹${(prevLimit / 100000).toFixed(1)}L` 
    });
  }

  let rebate = 0;
  if (regime === 'new') {
    if (taxableIncome <= 700000) {
      rebate = baseTax;
    } else if (taxableIncome <= 722222) {
      const excessIncome = taxableIncome - 700000;
      if (baseTax > excessIncome) {
        rebate = baseTax - excessIncome;
      }
    }
  } else if (taxableIncome <= 500000) {
    rebate = Math.min(baseTax, 12500);
  }

  const taxAfterRebate = Math.max(0, baseTax - rebate);
  const cess = taxAfterRebate * 0.04;
  const totalTax = Math.round((taxAfterRebate + cess) / 10) * 10;

  return {
    regime,
    taxableIncome,
    taxPayable: Math.round(baseTax),
    slabs,
    standardDeduction,
    appliedDeductions: applied,
    rebate: Math.round(rebate),
    cess: Math.round(cess),
    totalTax
  };
};
