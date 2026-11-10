import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanHtmlOutput,
  extractPageMetadata,
  injectAssetsIntoHtml,
  synthesizeLiveDraft,
  UploadedFileAsset,
} from './siteGenerator';

test('cleanHtmlOutput strips markdown codeblocks correctly', () => {
  const rawWithMarkdown = '```html\n<!DOCTYPE html><html><head><title>Test</title></head><body>Hello</body></html>\n```';
  const cleaned = cleanHtmlOutput(rawWithMarkdown);
  assert.equal(cleaned.includes('```'), false);
  assert.equal(cleaned.includes('<title>Test</title>'), true);
  assert.equal(cleaned.includes('tailwindcss.com'), true);
});

test('cleanHtmlOutput wraps bare HTML fragments with full DOCTYPE and Tailwind script', () => {
  const fragment = '<div class="p-8"><h1 class="text-3xl">Landing Page</h1></div>';
  const cleaned = cleanHtmlOutput(fragment);
  assert.equal(cleaned.includes('<!DOCTYPE html>'), true);
  assert.equal(cleaned.includes('tailwindcss.com'), true);
  assert.equal(cleaned.includes('Landing Page'), true);
});

test('extractPageMetadata extracts title, sections, and theme', () => {
  const html = `<!DOCTYPE html>
<html>
<head><title>My Awesome SaaS</title></head>
<body class="bg-slate-900 text-white">
  <header><h1>Welcome</h1></header>
  <main><section><h2>Features</h2></section></main>
  <footer><p>Copyright</p></footer>
  <script>console.log('hi');</script>
</body>
</html>`;
  const meta = extractPageMetadata(html);
  assert.equal(meta.title, 'My Awesome SaaS');
  assert.equal(meta.hasScript, true);
  assert.equal(meta.theme, 'dark');
  assert.equal(meta.headings.includes('Welcome'), true);
});

test('injectAssetsIntoHtml replaces image tokens with asset data URLs', () => {
  const html = '<div class="hero"><img src="{{ASSET_IMAGE_1}}" alt="Hero"></div>';
  const assets: UploadedFileAsset[] = [
    {
      id: '1',
      name: 'screenshot.png',
      size: 1024,
      type: 'image/png',
      isImage: true,
      isText: false,
      dataUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    },
  ];
  const injected = injectAssetsIntoHtml(html, assets);
  assert.equal(injected.includes('data:image/png;base64,'), true);
  assert.equal(injected.includes('{{ASSET_IMAGE_1}}'), false);
});

test('synthesizeLiveDraft creates responsive interactive preview from prompt and assets', () => {
  const draft = synthesizeLiveDraft('Modern Nike Sneaker E-commerce Store with Cart', [
    {
      id: 'img1',
      name: 'sneaker.jpg',
      size: 2048,
      type: 'image/jpeg',
      isImage: true,
      isText: false,
      dataUrl: 'data:image/jpeg;base64,xyz123',
    },
  ]);

  assert.equal(draft.includes('<!DOCTYPE html>'), true);
  assert.equal(draft.includes('tailwindcss.com'), true);
  assert.equal(draft.includes('Live Preview Reactive Engine'), true);
  assert.equal(draft.includes('data:image/jpeg;base64,xyz123'), true);
  assert.equal(draft.includes('1 asset mounted'), true);
});
