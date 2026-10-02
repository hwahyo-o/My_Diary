import { useState, type FormEvent } from 'react';
import type { AssetsSummaryViewModel, BudgetSummaryViewModel } from '../app/ui-types';
import type { AccountKind, AccountPurpose } from '../domain/accounts/types';

interface AssetsPageProps {
  readonly assets?: AssetsSummaryViewModel;
  readonly budget?: BudgetSummaryViewModel;
  readonly onSaveAccount?: ((input: {
    readonly name: string;
    readonly kind: AccountKind;
    readonly purpose: AccountPurpose;
    readonly openingBalanceMinor: number;
    readonly includeNetWorth: boolean;
  }) => Promise<string>) | undefined;
  readonly onSaveHolding?: ((input: {
    readonly accountId: string;
    readonly ticker: string;
    readonly quantity: string;
    readonly avgCostMinor: number;
    readonly marketValueMinor: number;
    readonly priceAsOf: string;
  }) => Promise<string>) | undefined;
  readonly onSetMonthlyBudget?: ((limitMinor: number) => Promise<void>) | undefined;
}

const won = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 });
const emptyAssets: AssetsSummaryViewModel = { netWorthMinor: 0, valuationLabel: '평가 정보 없음', accounts: [], holdings: [], purposes: [] };

export function AssetsPage({
  assets = emptyAssets,
  budget = { limitMinor: 0, usagePercent: 0, remainingMinor: 0, status: 'ok' },
  onSaveAccount,
  onSaveHolding,
  onSetMonthlyBudget,
}: AssetsPageProps) {
  const [accountName, setAccountName] = useState('');
  const [accountKind, setAccountKind] = useState<AccountKind>('checking');
  const [accountPurpose, setAccountPurpose] = useState<AccountPurpose>('daily');
  const [openingBalance, setOpeningBalance] = useState('');
  const [holdingAccountId, setHoldingAccountId] = useState('');
  const [ticker, setTicker] = useState('');
  const [quantity, setQuantity] = useState('');
  const [avgCost, setAvgCost] = useState('');
  const [marketValue, setMarketValue] = useState('');
  const [priceAsOf, setPriceAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [budgetLimit, setBudgetLimit] = useState(String(budget.limitMinor || ''));
  const [message, setMessage] = useState('');

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onSaveAccount || !accountName.trim()) return;
    await onSaveAccount({
      name: accountName.trim(),
      kind: accountKind,
      purpose: accountPurpose,
      openingBalanceMinor: Number(openingBalance || 0),
      includeNetWorth: true,
    });
    setAccountName('');
    setOpeningBalance('');
    setMessage('계좌를 암호화해 저장했습니다.');
  }

  async function submitHolding(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onSaveHolding || !holdingAccountId || !ticker.trim()) return;
    await onSaveHolding({
      accountId: holdingAccountId,
      ticker: ticker.trim(),
      quantity,
      avgCostMinor: Number(avgCost || 0),
      marketValueMinor: Number(marketValue || 0),
      priceAsOf,
    });
    setTicker('');
    setQuantity('');
    setAvgCost('');
    setMarketValue('');
    setMessage('보유종목을 암호화해 저장했습니다.');
  }

  async function submitBudget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onSetMonthlyBudget) return;
    await onSetMonthlyBudget(Number(budgetLimit || 0));
    setMessage('이번 달 예산을 암호화해 저장했습니다.');
  }

  return (
    <section className="page-stack" aria-labelledby="assets-title">
      <header className="page-header"><div><p className="eyebrow">NET WORTH</p><h1 id="assets-title">자산</h1></div></header>
      <article className="hero-balance">
        <span>순자산</span>
        <strong>{won.format(assets.netWorthMinor)}</strong>
        <p className="valuation-note">{assets.valuationLabel}</p>
      </article>

      <div className="dashboard-grid" aria-label="계좌 요약">
        {assets.accounts.map((account) => (
          <article className="dashboard-card" key={account.id}>
            <span className="card-label">{account.kind} · {account.purpose}</span>
            <strong>{account.name}</strong>
            <p>{won.format(account.balanceMinor)}</p>
          </article>
        ))}
      </div>

      {assets.holdings.length > 0 && (
        <div className="page-stack" aria-label="투자 보유종목">
          {assets.holdings.map((holding) => (
            <article className="dashboard-card" key={holding.id}>
              <span className="card-label">{holding.ticker} · {holding.priceAsOf}</span>
              <strong>{won.format(holding.marketValueMinor)}</strong>
              <p>평가손익 {won.format(holding.unrealizedGainMinor)} · {holding.returnPercent.toFixed(1)}%</p>
              <p>{holding.reason}</p>
            </article>
          ))}
        </div>
      )}

      {assets.purposes.some((item) => item.balanceMinor !== 0) && (
        <article className="dashboard-card">
          <span className="card-label">계좌 목적 분석</span>
          {assets.purposes.filter((item) => item.balanceMinor !== 0).map((item) => (
            <p key={item.purpose}>{item.purpose}: {won.format(item.balanceMinor)} ({item.sharePercent.toFixed(1)}%)</p>
          ))}
        </article>
      )}

      <form className="entry-form dashboard-card" onSubmit={submitBudget}>
        <strong>이번 달 예산</strong>
        <p>현재 사용률 {budget.usagePercent.toFixed(1)}% · 남은 금액 {won.format(budget.remainingMinor)}</p>
        <label><span>예산 한도</span><input aria-label="예산 한도" inputMode="numeric" value={budgetLimit} onChange={(event) => setBudgetLimit(event.currentTarget.value.replace(/\D/g, ''))} /></label>
        <button type="submit" className="primary-button" disabled={!onSetMonthlyBudget}>예산 저장</button>
      </form>

      <form className="entry-form dashboard-card" onSubmit={submitAccount}>
        <strong>계좌 추가</strong>
        <label><span>계좌 이름</span><input aria-label="계좌 이름" value={accountName} onChange={(event) => setAccountName(event.currentTarget.value)} /></label>
        <label><span>종류</span><select aria-label="계좌 종류" value={accountKind} onChange={(event) => setAccountKind(event.currentTarget.value as AccountKind)}>
          <option value="checking">입출금</option><option value="savings">저축</option><option value="cash">현금</option><option value="credit">신용카드</option><option value="loan">대출</option><option value="brokerage">투자</option>
        </select></label>
        <label><span>목적</span><select aria-label="계좌 목적" value={accountPurpose} onChange={(event) => setAccountPurpose(event.currentTarget.value as AccountPurpose)}>
          <option value="daily">생활비</option><option value="fixed-cost">고정비</option><option value="saving">저축</option><option value="emergency">비상금</option><option value="investment">투자</option><option value="other">기타</option>
        </select></label>
        <label><span>시작 잔액 / 대출 잔액</span><input aria-label="시작 잔액" inputMode="numeric" value={openingBalance} onChange={(event) => setOpeningBalance(event.currentTarget.value.replace(/\D/g, ''))} /></label>
        <button type="submit" className="primary-button" disabled={!onSaveAccount}>계좌 저장</button>
      </form>

      <form className="entry-form dashboard-card" onSubmit={submitHolding}>
        <strong>보유종목 추가</strong>
        <label><span>투자 계좌</span><select aria-label="보유종목 계좌" value={holdingAccountId} onChange={(event) => setHoldingAccountId(event.currentTarget.value)}>
          <option value="">선택</option>{assets.accounts.filter((account) => account.kind === 'brokerage').map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select></label>
        <label><span>종목 코드</span><input aria-label="종목 코드" value={ticker} onChange={(event) => setTicker(event.currentTarget.value)} /></label>
        <label><span>수량</span><input aria-label="수량" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.currentTarget.value)} /></label>
        <label><span>평균 매입가</span><input aria-label="평균 매입가" inputMode="numeric" value={avgCost} onChange={(event) => setAvgCost(event.currentTarget.value.replace(/\D/g, ''))} /></label>
        <label><span>현재 평가금액</span><input aria-label="현재 평가금액" inputMode="numeric" value={marketValue} onChange={(event) => setMarketValue(event.currentTarget.value.replace(/\D/g, ''))} /></label>
        <label><span>평가 기준일</span><input aria-label="평가 기준일" type="date" value={priceAsOf} onChange={(event) => setPriceAsOf(event.currentTarget.value)} /></label>
        <button type="submit" className="primary-button" disabled={!onSaveHolding}>보유종목 저장</button>
      </form>

      {message && <p className="assistive-copy" role="status">{message}</p>}
    </section>
  );
}
