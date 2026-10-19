import { type Inline, parseMarkdown } from '@marklyra/editor-markdown';
import { Fragment, memo, type ReactNode } from 'react';
import { agentApi } from './api.js';
import { documentLink } from './model.js';

export const MessageContent = memo(function MessageContent({
  source,
  root,
  open,
  report,
}: {
  source: string;
  root: string;
  open: (path: string) => void;
  report: (error: string) => void;
}) {
  const link = (href: string, label: ReactNode, key: string | number) => {
    const path = documentLink(href, root);
    const external = /^https?:\/\//i.test(href);
    if (!path && !external) return <span key={key}>{label}</span>;
    return (
      <a
        key={key}
        href={path ? `#document:${encodeURIComponent(path)}` : href}
        title={path ?? href}
        onClick={(event) => {
          event.preventDefault();
          if (path) open(path);
          else
            void agentApi
              .invoke('open_external_link', { url: href })
              .catch((e) => report(String(e)));
        }}
      >
        {label}
      </a>
    );
  };
  const plain = (value: string): ReactNode[] => {
    const result: ReactNode[] = [];
    let cursor = 0,
      links = 0;
    // Token scanning is linear; a long paragraph without paths must not backtrack.
    for (const match of value.matchAll(/\S+/gu)) {
      const token = match[0];
      let from = 0,
        to = token.length;
      while (from < to && '("\'‘“《【['.includes(token[from] ?? '')) from++;
      while (to > from && ',，。！？、；：!?,;:)"\'’”》】]'.includes(token[to - 1] ?? '')) to--;
      const candidate = token.slice(from, to);
      if (
        candidate.length > 4096 ||
        !/^[\p{L}\p{N}_./\\-]+$/u.test(candidate) ||
        !documentLink(candidate, root)
      )
        continue;
      const start = match.index + from;
      result.push(<Fragment key={`text:${cursor}`}>{value.slice(cursor, start)}</Fragment>);
      result.push(link(candidate, candidate, `link:${start}`));
      cursor = match.index + to;
      if (++links >= 128) break;
    }
    result.push(<Fragment key={`text:${cursor}`}>{value.slice(cursor)}</Fragment>);
    return result;
  };
  const inline = (nodes: readonly Inline[], autoLinks = true): ReactNode[] => {
    let consumed = -1;
    const maximum = nodes.at(-1)?.to ?? source.length;
    return nodes.map((node) => {
      if (node.to <= consumed) return null;
      const value = source.slice(Math.max(node.contentFrom, consumed), node.contentTo);
      const nestedLinks = autoLinks && node.kind !== 'link';
      const children = node.children.length
        ? inline(node.children, nestedLinks)
        : nestedLinks
          ? plain(value)
          : value;
      switch (node.kind) {
        case 'link': {
          // The shared bounded parser stops at the first ')'; extend balanced URL parentheses locally.
          const start = node.contentTo + 2;
          let depth = 1,
            end = start;
          for (; end < maximum; end++) {
            if (source[end] === '\\') {
              end++;
              continue;
            }
            if (source[end] === '(') depth++;
            else if (source[end] === ')' && --depth === 0) break;
          }
          const href = depth === 0 ? source.slice(start, end) : (node.destination ?? '');
          if (depth === 0) consumed = end + 1;
          return link(href, children, node.from);
        }
        case 'strong':
          return <strong key={node.from}>{children}</strong>;
        case 'emphasis':
          return <em key={node.from}>{children}</em>;
        case 'strike':
          return <del key={node.from}>{children}</del>;
        case 'code':
          return <code key={node.from}>{children}</code>;
        default:
          return <Fragment key={node.from}>{children}</Fragment>;
      }
    });
  };
  return (
    <div className="ai-markdown">
      {parseMarkdown(source).blocks.map((block) => {
        const content = inline(block.inlines);
        switch (block.kind) {
          case 'blank':
            return null;
          case 'rule':
            return <hr key={block.from} />;
          case 'code':
            return (
              <pre key={block.from}>
                <code>{source.slice(block.contentFrom, block.contentTo)}</code>
              </pre>
            );
          case 'heading':
            return (
              <p className="ai-message-heading" key={block.from}>
                {content}
              </p>
            );
          case 'quote':
            return <blockquote key={block.from}>{content}</blockquote>;
          case 'list-item':
            return (
              <div className="ai-list-item" key={block.from}>
                <span aria-hidden="true">•</span>
                <div>{content}</div>
              </div>
            );
          default:
            return <p key={block.from}>{content}</p>;
        }
      })}
    </div>
  );
});
