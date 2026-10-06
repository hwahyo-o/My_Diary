import type { EntityMeta, ISODate } from '../shared/types';

export type ReportType = 'month_start' | 'month_end' | 'half_year' | 'year_end';
export type Confidence = 'low' | 'medium' | 'high';

export interface ReportSnapshot {
  readonly cashFlow: {
    readonly incomeMinor: number;
    readonly expenseMinor: number;
    readonly netCashflowMinor: number;
  };
  readonly fixedVariable: {
    readonly fixedMinor: number;
    readonly variableMinor: number;
    readonly mixedMinor: number;
  };
  readonly categoryTotals: Readonly<Record<string, number>>;
}

export interface Report extends EntityMeta {
  readonly type: ReportType;
  readonly periodStart: ISODate;
  readonly periodEnd: ISODate;
  readonly sourceRevision: number;
  readonly confidence: Confidence;
  readonly snapshot: ReportSnapshot;
}
