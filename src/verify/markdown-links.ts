export interface MarkdownLink {
  index: number;
  length: number;
  image: boolean;
  target: string;
}

const escapedAt = (text: string, index: number) => {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor--)
    slashes++;
  return slashes % 2 !== 0;
};

export function markdownInlineCodeAt (markdown: string, position: number): boolean {
  let paragraphStart = markdown.lastIndexOf('\n', position - 1) + 1;
  while (paragraphStart > 0) {
    const previousEnd = paragraphStart - 1;
    const previousStart = markdown.lastIndexOf('\n', previousEnd - 1) + 1;
    if (!markdown.slice(previousStart, previousEnd).trim())
      break;
    paragraphStart = previousStart;
  }
  let open = 0;
  for (const match of markdown.slice(paragraphStart, position).matchAll(/`+/gu)) {
    const index = paragraphStart + match.index;
    if (!escapedAt(markdown, index))
      open = open === 0 ? match[0].length : open === match[0].length ? 0 : open;
  }
  return open !== 0;
}

export function markdownLinks (markdown: string): MarkdownLink[] {
  const links: MarkdownLink[] = [];
  let cursor = 0;
  while (cursor < markdown.length) {
    const open = markdown.indexOf('[', cursor);
    if (open < 0)
      break;
    if (escapedAt(markdown, open)) {
      cursor = open + 1;
      continue;
    }
    let labelOpen = open;
    let close = open + 1;
    let invalidEscape = false;
    while (close < markdown.length) {
      const char = markdown[close]!;
      if (char === '\\') {
        const next = markdown[close + 1];
        if (next === '\n' || next === '\r') {
          invalidEscape = true;
          break;
        }
        if (next === undefined)
          break;
        close += 2;
        continue;
      }
      if (char === '[' && !escapedAt(markdown, close)) {
        labelOpen = close;
        close++;
        continue;
      }
      if (char === ']')
        break;
      close++;
    }
    if (invalidEscape) {
      cursor = open + 1;
      continue;
    }
    if (close >= markdown.length || markdown[close] !== ']')
      break;
    if (markdown[close + 1] !== '(') {
      cursor = close + 1;
      continue;
    }
    let end = close + 2;
    while (end < markdown.length && markdown[end] !== ')' && !/\s/u.test(markdown[end]!))
      end++;
    if (end === close + 2 || end >= markdown.length || markdown[end] !== ')') {
      cursor = close + 1;
      continue;
    }
    const image = labelOpen > 0 && markdown[labelOpen - 1] === '!' && !escapedAt(markdown, labelOpen - 1);
    const index = image ? labelOpen - 1 : labelOpen;
    links.push({
      index,
      length: end - index + 1,
      image,
      target: markdown.slice(close + 2, end),
    });
    cursor = end + 1;
  }
  return links;
}
