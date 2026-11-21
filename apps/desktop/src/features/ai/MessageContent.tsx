import type { Inline } from '@marklyra/editor-markdown';
import { Fragment, memo, type ReactNode } from 'react';
import { MarkdownBlocks } from '../../components/MarkdownBlocks.js';
import { AnswerCode } from './AnswerCode.js';
import { answerSections } from './answer-sections.js';
import { agentApi } from './api.js';
import { documentLink } from './model.js';

interface ContentProps {
  source: string;
  answer?: boolean;
  runtimeUrl?: string | undefined;
  dark?: boolean;
  root: string;
  open: (path: string) => void;
  report: (error: string) => void;
}

export const MessageContent = memo(function MessageContent(props: ContentProps) {
  // History may contain multi-megabyte responses. Keep every character selectable without
  // constructing an unbounded Markdown tree or thousands of interactive components.
  if (
    props.source.length > 96_000 ||
    props.source.split(/\r\n?|\n/, 2001).length > 2000 ||
    (props.source.match(/[|`_*[]/g)?.length ?? 0) > 8000
  )
    return (
      <div className="ai-markdown">
        <pre className="ai-plain-output">{props.source}</pre>
      </div>
    );
  return (
    <div className="ai-markdown">
      {(props.answer ? answerSections(props.source) : [{ from: 0, text: props.source }]).map(
        (part) => (
          <MessageSection {...props} key={part.from} source={part.text} />
        ),
      )}
    </div>
  );
});

const MessageSection = memo(function MessageSection({
  source,
  root,
  open,
  report,
  answer,
  runtimeUrl,
  dark = false,
}: ContentProps) {
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
  const inline = (nodes: readonly Inline[], tableCell = false, autoLinks = true): ReactNode[] => {
    let consumed = -1;
    const maximum = nodes.at(-1)?.to ?? source.length;
    return nodes.map((node) => {
      if (node.to <= consumed) return null;
      const raw = source.slice(Math.max(node.contentFrom, consumed), node.contentTo);
      const value = tableCell ? raw.replace(/\\\|/g, '|') : raw;
      const nestedLinks = autoLinks && node.kind !== 'link' && node.kind !== 'code';
      const children = node.children.length
        ? inline(node.children, tableCell, nestedLinks)
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
    <MarkdownBlocks
      source={source}
      inline={inline}
      prefix="ai-md"
      codeBlock={(block) => {
        const isYaml = block.kind === 'frontmatter';
        const language = isYaml
          ? 'yaml'
          : (/^ {0,3}(?:`{3,}|~{3,})[ \t]*([^\s`~]+)/
              .exec(block.raw)?.[1]
              ?.toLowerCase()
              .slice(0, 48) ?? '');
        const code = source.slice(block.contentFrom, block.contentTo);
        return answer ? (
          <AnswerCode
            language={language}
            source={code}
            closed={isYaml || block.contentTo < block.to}
            runtimeUrl={runtimeUrl}
            dark={dark}
            report={report}
          />
        ) : (
          <pre>
            <code>{code}</code>
          </pre>
        );
      }}
    />
  );
});
