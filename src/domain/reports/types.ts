import type { EntityMeta, ISODate } from '../shared/types';

export type ReportType = 'month_start' | 'month_end' | 'half_year' | 'year_end';
export type Confidence = 'low' | 'medium' | 'high';

export interface Report extends EntityMeta {
  readonly type: ReportType;
  readonly periodStart: ISODate;
  readonly periodEnd: ISODate;
  readonly sourceRevision: number;
  readonly confidence: Confidence;
}
