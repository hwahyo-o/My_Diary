import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HostingNotice } from './HostingNotice';

describe('HostingNotice', () => {
  it('warns on the GitHub Pages recovery mirror', () => {
    render(<HostingNotice hostname="hwahyo-o.github.io" />);

    expect(screen.getByRole('complementary', { name: '호스팅 안내' })).toHaveTextContent('복구·검증용 GitHub Pages 미러');
    expect(screen.getByText(/my-diary-2mw\.pages\.dev/)).toBeInTheDocument();
    expect(screen.getByText(/자동으로 공유되지 않습니다/)).toBeInTheDocument();
  });

  it('stays hidden on the Cloudflare production host', () => {
    const { container } = render(<HostingNotice hostname="my-diary-2mw.pages.dev" />);
    expect(container).toBeEmptyDOMElement();
  });
});
