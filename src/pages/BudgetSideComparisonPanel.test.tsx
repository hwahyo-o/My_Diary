import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { BudgetSideComparisonPanel } from './BudgetSideComparisonPanel';

it('renders both verified sides without a destructive or automatic confirmation control', () => {
  render(<BudgetSideComparisonPanel comparison={{
    local: { latestId: 'a', latestLimitMinor: 100000, recordIds: ['a'] },
    remote: { latestId: 'b', latestLimitMinor: 200000, recordIds: ['b'] },
    sameLatestRecord: false,
    requiresReview: true,
  }} />);
  expect(screen.getByLabelText('로컬 예산')).toHaveTextContent('100,000원');
  expect(screen.getByLabelText('클라우드 예산')).toHaveTextContent('200,000원');
  expect(screen.getByRole('status')).toHaveTextContent('추가 검증');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});

it('clearly reports identical candidate histories', () => {
  render(<BudgetSideComparisonPanel comparison={{
    local: { latestId: 'same', latestLimitMinor: 100000, recordIds: ['same'] },
    remote: { latestId: 'same', latestLimitMinor: 100000, recordIds: ['same'] },
    sameLatestRecord: true,
    requiresReview: false,
  }} />);
  expect(screen.getByRole('status')).toHaveTextContent('일치합니다');
});
