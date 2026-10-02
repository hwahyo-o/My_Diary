import type { AppPage } from '../app/ui-types';

const items: readonly { page: AppPage; label: string }[] = [
  { page: 'home', label: '홈' },
  { page: 'calendar', label: '캘린더' },
  { page: 'stats', label: '통계' },
  { page: 'assets', label: '자산' },
  { page: 'settings', label: '설정' },
];

interface BottomNavigationProps {
  readonly currentPage: AppPage;
  readonly onNavigate: (page: AppPage) => void;
}

export function BottomNavigation({ currentPage, onNavigate }: BottomNavigationProps) {
  return (
    <nav className="bottom-navigation" aria-label="주요 메뉴">
      {items.map((item) => (
        <button
          key={item.page}
          type="button"
          aria-current={currentPage === item.page ? 'page' : undefined}
          onClick={() => onNavigate(item.page)}
        >
          {item.label}
        </button>
      ))}
    </nav>
  );
}
