import { describe, expect, it } from 'vitest';
import { extractCorrectionKeyword, recordCorrection, suggestCorrections } from './correction-suggestions';

describe('correction suggestion safety', () => {
  it('only suggests the same manual category after three repetitions', () => {
    let observations = recordCorrection([], '샌드위치', 'food', 'uncategorized');
    observations = recordCorrection(observations, '샌드위치', 'food', 'uncategorized');
    expect(suggestCorrections(observations, new Set())).toEqual([]);
    observations = recordCorrection(observations, '샌드위치', 'food', 'uncategorized');
    expect(suggestCorrections(observations, new Set())).toEqual([
      { keyword: '샌드위치', categoryId: 'food', count: 3 },
    ]);
    expect(suggestCorrections(observations, new Set(['샌드위치']))).toEqual([]);
  });

  it('resets evidence when a user corrects the same keyword differently', () => {
    let observations = recordCorrection([], '마트', 'household', 'uncategorized');
    observations = recordCorrection(observations, '마트', 'household', 'uncategorized');
    observations = recordCorrection(observations, '마트', 'food', 'uncategorized');
    expect(observations).toEqual([{ keyword: '마트', categoryId: 'food', count: 1 }]);
  });

  it('never learns raw sentences, amount-like or already matching category terms', () => {
    expect(extractCorrectionKeyword('내가 오늘 샀던 것')).toBe(null);
    expect(extractCorrectionKeyword('4500')).toBe(null);
    expect(recordCorrection([], '커피', 'food', 'food')).toEqual([]);
  });
});
