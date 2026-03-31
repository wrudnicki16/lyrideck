import { stripHtml, splitFields } from './parseApkg';

describe('stripHtml', () => {
  it('removes simple tags', () => {
    expect(stripHtml('<b>hello</b>')).toBe('hello');
  });
  it('converts br tags to newlines', () => {
    expect(stripHtml('line1<br>line2')).toBe('line1\nline2');
  });
  it('handles self-closing br tags', () => {
    expect(stripHtml('line1<br/>line2')).toBe('line1\nline2');
  });
  it('handles br tags with space', () => {
    expect(stripHtml('line1<br />line2')).toBe('line1\nline2');
  });
  it('trims whitespace', () => {
    expect(stripHtml('  <span>word</span>  ')).toBe('word');
  });
  it('returns plain text unchanged', () => {
    expect(stripHtml('plain text')).toBe('plain text');
  });
  it('decodes &nbsp; to spaces', () => {
    expect(stripHtml('अच्छा&nbsp;acchaa')).toBe('अच्छा acchaa');
  });
  it('decodes &amp; &lt; &gt; &quot;', () => {
    expect(stripHtml('a &amp; b &lt; c &gt; d &quot;e&quot;')).toBe('a & b < c > d "e"');
  });
  it('decodes numeric entities', () => {
    expect(stripHtml('&#39;hello&#39;')).toBe("'hello'");
  });
  it('decodes hex entities', () => {
    expect(stripHtml('&#x27;hello&#x27;')).toBe("'hello'");
  });
  it('handles mixed HTML tags and entities', () => {
    expect(stripHtml('<b>hello</b>&nbsp;<i>world</i>')).toBe('hello world');
  });
});

describe('splitFields', () => {
  it('splits on unit separator', () => {
    expect(splitFields('front\x1fback')).toEqual(['front', 'back']);
  });
  it('handles three fields', () => {
    expect(splitFields('a\x1fb\x1fc')).toEqual(['a', 'b', 'c']);
  });
  it('handles single field', () => {
    expect(splitFields('only')).toEqual(['only']);
  });
});
