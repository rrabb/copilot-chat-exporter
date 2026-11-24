import assert from 'node:assert/strict';
import test from 'node:test';
import { markdownLinks } from '../src/verify/markdown-links.ts';

test('Markdown link scanning handles long unfinished labels without recursion', () => {
  const noise = '[' + 'x'.repeat(9 * 1024 * 1024);
  assert.deepEqual(markdownLinks(noise), []);
  assert.deepEqual(markdownLinks('!\\[escaped](assets/no.png) [Text](assets/full.txt) ![Image](assets/image.png)').map((link) => ({
    image: link.image, target: link.target,
  })), [
    { image: false, target: 'assets/full.txt' },
    { image: true, target: 'assets/image.png' },
  ]);
  const escapedLineBreak = '[broken' + '\\' + '\n]\n[Later](assets/later.txt)';
  assert.deepEqual(markdownLinks(escapedLineBreak).map((link) => link.target), ['assets/later.txt']);
  assert.deepEqual(markdownLinks('[unfinished ![Image](assets/image.png)').map((link) => ({
    image: link.image, target: link.target,
  })), [{ image: true, target: 'assets/image.png' }]);
});
