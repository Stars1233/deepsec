// VULN: xss — dangerouslySetInnerHTML with user data

interface CommentProps {
  content: string;
  author: string;
}

export function Comment({ content, author }: CommentProps) {
  // Vulnerable: user content rendered as raw HTML
  return (
    <div className="comment">
      <span className="author">{author}</span>
      <div dangerouslySetInnerHTML={{ __html: content }} />
    </div>
  );
}

export function RawComment({ html }: { html: string }) {
  // Also vulnerable: innerHTML assignment
  const ref = (el: HTMLDivElement | null) => {
    if (el) el.innerHTML = html;
  };
  return <div ref={ref} />;
}
