/** Trial RPC `consume_trial_credit` cost per backtest, AI analysis, or paper deploy (see Edge functions). */
export const TRIAL_CREDITS_PER_ACTION = 10;

export function trialCreditsPerActionLine(): string {
  return `Each backtest, AI analysis run, and paper deploy uses ${TRIAL_CREDITS_PER_ACTION} trial credits.`;
}
