import { useMemo, useState, type FormEvent } from 'react';
import type {
  AssetsViewModel,
  SaveAccountInput,
  SaveHoldingInput,
  SaveLoanInput,
} from '../app/ui-types';

interface AssetsPageProps {
  readonly assets?: AssetsViewModel;
  readonly onSaveAccount?: (input: SaveAccountInput) => Promise<string>;
  readonly onSaveHolding?: (input: SaveHoldingInput) => Promise<void>;
  readonly onSaveLoan?: (input: SaveLoanInput) => Promise<void>;
}

const won = new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW', maximumFractionDigits: 0 });

export function AssetsPage({
  assets = {
    netWorthMinor: 0,
    valuationLabel: '평가 정보 없음',
    accounts: [],
    loans: [],
    holdings: [],
    accountPurpose: {
      totalAssetBalanceMinor: 0,
      purposeCoverage: 0,
      byPurpose: { daily: 0, 'fixed-cost': 0, saving: 0, emergency: 0, investment: 0, other: 0 },
    },
  },
  onSaveAccount,
  onSaveHolding,
  onSaveLoan,
}: AssetsPageProps) {
  const [accountName, setAccountName] = useState('');
  const [accountBalance, setAccountBalance] = useState('');
  const [accountKind, setAccountKind] = useState<SaveAccountInput['kind']>('cash');
  const [accountPurpose, setAccountPurpose] = useState<SaveAccountInput['purpose']>('daily');
  const [ticker, setTicker] = useState('');
  const [quantity, setQuantity] = useState('');
  const [avgCost, setAvgCost] = useState('');
  const [marketValue, setMarketValue] = useState('');
  const [priceAsOf, setPriceAsOf] = useState('');
  const [loanPrincipal, setLoanPrincipal] = useState('');
  const [loanRate, setLoanRate] = useState('');

  const holdingAccountId = useMemo(
    () => assets.accounts.find((account) => account.kind === 'brokerage')?.id ?? assets.accounts[0]?.id ?? '',
    [assets.accounts],
  );
  const loanAccountId = useMemo(
    () => assets.accounts.find((account) => account.kind === 'loan')?.id ?? assets.accounts[0]?.id ?? '',
    [assets.accounts],
  );

  const submitAccount = (event: FormEvent) => {
    event.preventDefault();
    if (!onSaveAccount) return;
    const balanceMinor = Number(accountBalance);
    if (!accountName.trim() || !Number.isSafeInteger(balanceMinor)) return;
    void onSaveAccount({
      name: accountName,
      kind: accountKind,
      purpose: accountPurpose,
      balanceMinor,
      includeNetWorth: true,
    });
  };

  const submitHolding = (event: FormEvent) => {
    event.preventDefault();
    if (!onSaveHolding || !holdingAccountId) return;
    const avgCostMinor = Number(avgCost);
    const marketValueMinor = Number(marketValue);
    if (!ticker.trim() || !quantity || !priceAsOf || !Number.isSafeInteger(avgCostMinor) || !Number.isSafeInteger(marketValueMinor)) return;
    void onSaveHolding({
      accountId: holdingAccountId,
      ticker,
      quantity,
      avgCostMinor,
      marketValueMinor,
      priceAsOf,
    });
  };

  const submitLoan = (event: FormEvent) => {
    event.preventDefault();
    if (!onSaveLoan || !loanAccountId) return;
    const remainingPrincipalMinor = Number(loanPrincipal);
    const annualInterestRate = Number(loanRate);
    if (!Number.isSafeInteger(remainingPrincipalMinor) || !Number.isFinite(annualInterestRate)) return;
    void onSaveLoan({ accountId: loanAccountId, remainingPrincipalMinor, annualInterestRate });
  };

  return (
    <section className="page-stack" aria-labelledby="assets-title">
      <header className="page-header"><div><p className="eyebrow">NET WORTH</p><h1 id="assets-title">자산</h1></div></header>
      <article className="hero-balance">
        <span>순자산</span>
        <strong>{won.format(assets.netWorthMinor)}</strong>
        <p className="valuation-note">{assets.valuationLabel}</p>
      </article>

      <article className="dashboard-card">
        <h2>계좌 목적 분석</h2>
        <p>목적 지정률 {Math.round(assets.accountPurpose.purposeCoverage * 100)}%</p>
        <p>생활비 {won.format(assets.accountPurpose.byPurpose.daily)} · 저축 {won.format(assets.accountPurpose.byPurpose.saving)} · 투자 {won.format(assets.accountPurpose.byPurpose.investment)}</p>
      </article>

      <section className="page-stack" aria-labelledby="account-list-title">
        <h2 id="account-list-title">계좌</h2>
        {assets.accounts.length === 0 ? <p className="assistive-copy">등록된 계좌가 없습니다.</p> : assets.accounts.map((account) => (
          <article className="dashboard-card" key={account.id}>
            <strong>{account.name}</strong>
            <p>{account.kind} · {account.purpose ?? '목적 미지정'} · {won.format(account.balanceMinor)}</p>
          </article>
        ))}
      </section>

      <section className="page-stack" aria-label="보유 종목 목록">
        <h2>보유 종목</h2>
        {assets.holdings.length === 0 ? <p className="assistive-copy">등록된 보유 종목이 없습니다.</p> : assets.holdings.map((holding) => (
          <article className="dashboard-card" key={holding.holdingId}>
            <strong>{holding.ticker}</strong>
            <p>{won.format(holding.marketValueMinor)} · {holding.returnPercent.toFixed(1)}%</p>
            <p>{holding.reason}</p>
          </article>
        ))}
      </section>

      <details>
        <summary>계좌 추가</summary>
        <form onSubmit={submitAccount} className="page-stack">
          <label htmlFor="account-name">계좌 이름</label>
          <input id="account-name" value={accountName} onChange={(event) => setAccountName(event.target.value)} />
          <label htmlFor="account-balance">계좌 잔액</label>
          <input id="account-balance" inputMode="numeric" value={accountBalance} onChange={(event) => setAccountBalance(event.target.value)} />
          <label htmlFor="account-kind">계좌 종류</label>
          <select id="account-kind" value={accountKind} onChange={(event) => setAccountKind(event.target.value as SaveAccountInput['kind'])}>
            <option value="cash">현금</option><option value="checking">입출금</option><option value="savings">저축</option><option value="credit">카드</option><option value="loan">대출</option><option value="brokerage">투자</option>
          </select>
          <label htmlFor="account-purpose">계좌 목적</label>
          <select id="account-purpose" value={accountPurpose} onChange={(event) => setAccountPurpose(event.target.value as SaveAccountInput['purpose'])}>
            <option value="daily">생활비</option><option value="fixed-cost">고정비</option><option value="saving">저축</option><option value="emergency">비상금</option><option value="investment">투자</option><option value="other">기타</option>
          </select>
          <button type="submit" disabled={!onSaveAccount}>계좌 추가</button>
        </form>
      </details>

      <details>
        <summary>보유종목 추가</summary>
        <form onSubmit={submitHolding} className="page-stack">
          <label htmlFor="holding-ticker">보유 종목</label>
          <input id="holding-ticker" value={ticker} onChange={(event) => setTicker(event.target.value)} />
          <label htmlFor="holding-quantity">수량</label>
          <input id="holding-quantity" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
          <label htmlFor="holding-cost">평균 단가</label>
          <input id="holding-cost" inputMode="numeric" value={avgCost} onChange={(event) => setAvgCost(event.target.value)} />
          <label htmlFor="holding-value">평가 금액</label>
          <input id="holding-value" inputMode="numeric" value={marketValue} onChange={(event) => setMarketValue(event.target.value)} />
          <label htmlFor="holding-date">가격 기준일</label>
          <input id="holding-date" type="date" value={priceAsOf} onChange={(event) => setPriceAsOf(event.target.value)} />
          <button type="submit" disabled={!onSaveHolding || !holdingAccountId}>보유종목 추가</button>
        </form>
      </details>

      <details>
        <summary>대출 추가</summary>
        <form onSubmit={submitLoan} className="page-stack">
          <label htmlFor="loan-principal">대출 원금</label>
          <input id="loan-principal" inputMode="numeric" value={loanPrincipal} onChange={(event) => setLoanPrincipal(event.target.value)} />
          <label htmlFor="loan-rate">연 이자율</label>
          <input id="loan-rate" inputMode="decimal" value={loanRate} onChange={(event) => setLoanRate(event.target.value)} />
          <button type="submit" disabled={!onSaveLoan || !loanAccountId}>대출 추가</button>
        </form>
      </details>
    </section>
  );
}
