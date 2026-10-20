import './sponsorship.css';

const qrCode = new URL('./assets/wechat-sponsor-qr.jpg', import.meta.url).href;

/** A local, optional support page. Displaying the QR code does not initiate a payment. */
export function SponsorshipPage() {
  return (
    <section className="sponsorship-page" aria-labelledby="sponsorship-title">
      <div className="sponsorship-content">
        <header className="sponsorship-heading">
          <h1 id="sponsorship-title">赞助</h1>
          <p>支持 MarkLyra 的持续维护与迭代</p>
        </header>
        <div className="sponsorship-card">
          <div className="sponsorship-introduction">
            <svg
              className="sponsorship-mark"
              viewBox="0 0 48 48"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M24 24s-10-6.2-10-12.2a5.8 5.8 0 0 1 10-4 5.8 5.8 0 0 1 10 4C34 17.8 24 24 24 24Z" />
              <path d="M7 23v16c6-1 11 .2 17 4 6-3.8 11-5 17-4V23c-4.8-.8-8.4-.2-12 1.2M7 23c4.8-.8 8.4-.2 12 1.2M24 29v14M12 30c2.2 0 4.4.6 6.5 1.6M12 35c2.2 0 4.4.6 6.5 1.6M36 30c-2.2 0-4.4.6-6.5 1.6M36 35c-2.2 0-4.4.6-6.5 1.6" />
            </svg>
            <h2>
              一起，让 MarkLyra
              <br />
              持续变好。
            </h2>
            <p className="sponsorship-description">
              MarkLyra 是一款免费、开源的 Markdown 编辑器。
              如果它让你的写作、笔记或知识整理更顺手，欢迎支持它的后续维护。
            </p>
            <p className="sponsorship-purpose">修复问题 · 打磨体验 · 持续迭代</p>
            <p className="sponsorship-thanks">感谢每一份支持，也感谢你选择 MarkLyra。</p>
          </div>
          <figure className="sponsorship-payment">
            <div className="sponsorship-qr-surface">
              <img
                src={qrCode}
                alt="微信赞助二维码"
                width={386}
                height={379}
                decoding="sync"
                draggable={false}
              />
            </div>
            <figcaption>
              <strong>微信扫一扫</strong>
              <span>感谢你对开源项目的支持。</span>
            </figcaption>
          </figure>
          <footer className="sponsorship-note">
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m5.5 10 3 3 6-6" />
              <circle cx="10" cy="10" r="8" />
            </svg>
            <p>
              <strong>自愿赞助，不影响任何功能的使用。</strong>
              <span>无论是否赞助，都欢迎你继续使用、分享和改进 MarkLyra。</span>
            </p>
          </footer>
        </div>
      </div>
    </section>
  );
}
