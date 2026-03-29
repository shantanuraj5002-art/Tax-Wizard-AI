import { calculateTax } from './src/lib/tax-logic';

const incomeSources = {
  salary: 1200000,
  houseProperty: 0,
  capitalGains: 0,
  businessIncome: 0,
  otherIncome: 0
};

const deductions = {
  section80C: 150000,
  section80D: 25000,
  section24: 0,
  section80E: 0,
  hra: 0,
  nps: 0,
  other: 0
};

const oldResult = calculateTax(incomeSources, deductions, 'old');
const newResult = calculateTax(incomeSources, deductions, 'new');

console.log('Old Regime:', JSON.stringify(oldResult, null, 2));
console.log('New Regime:', JSON.stringify(newResult, null, 2));
