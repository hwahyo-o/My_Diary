interface HostingNoticeProps {
  readonly hostname?: string;
}

const GITHUB_PAGES_HOST = 'hwahyo-o.github.io';

export function HostingNotice({
  hostname = window.location.hostname,
}: HostingNoticeProps) {
  if (hostname !== GITHUB_PAGES_HOST) return null;

  return (
    <aside className="hosting-notice" aria-label="호스팅 안내">
      <strong>복구·검증용 GitHub Pages 미러</strong>
      <span>
        실제 금융 기록은 정식 Cloudflare 사이트 my-diary-2mw.pages.dev 에서 사용하세요.
        두 주소의 Vault 데이터는 자동으로 공유되지 않습니다.
      </span>
    </aside>
  );
}
