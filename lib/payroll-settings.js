// Change this one value to change the monthly-salary auto-fill divisor.
export const SALARY_DAY_DIVISOR = 30;
export const DEFAULT_SUNDAY_PAID = true;
export function suggestedPerDayRate(monthlySalary) {
  return Math.round((Number(monthlySalary) / SALARY_DAY_DIVISOR + Number.EPSILON) * 100) / 100;
}
export function payrollMonthNow() {
  const parts = new Intl.DateTimeFormat('en', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}`;
}
