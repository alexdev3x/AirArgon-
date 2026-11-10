/**
 * Pure logic and template generator for WebClone AI Studio.
 * Handles HTML cleanup, asset injection, real-time draft synthesis, and prompt preparation.
 */

export interface UploadedFileAsset {
  id: string;
  name: string;
  size: number;
  type: string;
  isImage: boolean;
  isText: boolean;
  dataUrl?: string;
  textContent?: string;
  role?: 'reference_screenshot' | 'logo' | 'hero_image' | 'gallery' | 'content_source';
}

export interface SiteMetadata {
  title: string;
  sectionCount: number;
  hasScript: boolean;
  theme: 'dark' | 'light' | 'mixed';
  headings: string[];
}

/**
 * Strips markdown code blocks and normalizes generated HTML.
 * Ensures critical head tags (Tailwind CDN, viewport, font) are present.
 */
export function cleanHtmlOutput(raw: string): string {
  if (!raw) return '';

  let html = raw.trim();

  // Strip markdown code fence if present
  if (html.startsWith('```html')) {
    html = html.substring(7);
  } else if (html.startsWith('```')) {
    html = html.substring(3);
  }

  if (html.endsWith('```')) {
    html = html.substring(0, html.length - 3);
  }

  html = html.trim();

  // If the model only returned body content, wrap it in a proper HTML5 shell
  if (!html.toLowerCase().includes('<!doctype html') && !html.toLowerCase().includes('<html')) {
    html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Generated Website</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: { 50: '#eff6ff', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' }
          }
        }
      }
    }
  </script>
</head>
<body class="bg-slate-50 text-slate-900 antialiased font-sans">
${html}
</body>
</html>`;
  }

  // Ensure Tailwind CDN exists if not already present
  if (!html.includes('tailwindcss.com')) {
    const headInsert = `<script src="https://cdn.tailwindcss.com"></script>\n<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">\n`;
    if (html.includes('<head>')) {
      html = html.replace('<head>', `<head>\n  ${headInsert}`);
    } else if (html.includes('</title>')) {
      html = html.replace('</title>', `</title>\n  ${headInsert}`);
    }
  }

  return html;
}

/**
 * Extracts metadata from generated HTML for the studio inspector.
 */
export function extractPageMetadata(html: string): SiteMetadata {
  if (!html) {
    return { title: 'Empty Page', sectionCount: 0, hasScript: false, theme: 'light', headings: [] };
  }

  // Title extraction
  const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : 'Website Preview';

  // Section count (sections, headers, footers, mains)
  const sections = (html.match(/<(section|article|header|footer|nav|main)[^>]*>/gi) || []).length;

  // Headings
  const headingMatches = html.match(/<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi) || [];
  const headings = headingMatches.slice(0, 5).map(h => h.replace(/<[^>]+>/g, '').trim());

  // Check script
  const hasScript = /<script\b[^>]*>([\s\S]*?)<\/script>/i.test(html);

  // Check dark/light
  const isDark = html.includes('bg-slate-900') || html.includes('bg-gray-900') || html.includes('bg-black') || html.includes('dark');
  const isLight = html.includes('bg-white') || html.includes('bg-slate-50') || html.includes('bg-gray-50');

  let theme: 'dark' | 'light' | 'mixed' = 'light';
  if (isDark && isLight) theme = 'mixed';
  else if (isDark) theme = 'dark';

  return {
    title,
    sectionCount: Math.max(sections, 1),
    hasScript,
    theme,
    headings,
  };
}

/**
 * Injects uploaded image data URLs or text file contents into the generated website HTML
 * matching placeholder comments or tags.
 */
export function injectAssetsIntoHtml(html: string, assets: UploadedFileAsset[]): string {
  if (!assets || assets.length === 0) return html;

  let result = html;
  const imageAssets = assets.filter(a => a.isImage && a.dataUrl);

  if (imageAssets.length > 0) {
    // If the template has image placeholders or hero images, replace with uploaded assets
    imageAssets.forEach((asset, idx) => {
      // Replace generic placeholder tokens
      const token = `{{ASSET_IMAGE_${idx + 1}}}`;
      result = result.replaceAll(token, asset.dataUrl || '');

      // Also replace data-asset-slot="image-N"
      const slotRegex = new RegExp(`src="[^"]*"(?=[^>]*data-asset-slot="image-${idx + 1}")`, 'g');
      result = result.replace(slotRegex, `src="${asset.dataUrl}"`);
    });
  }

  return result;
}

/**
 * Real-time instant preview synthesizer:
 * Generates an instant, highly styled, interactive preview as the user types messages
 * and drops files/images, giving immediate live visual feedback.
 */
export function synthesizeLiveDraft(
  message: string,
  files: UploadedFileAsset[] = [],
  options?: { isCloning?: boolean }
): string {
  const query = (message || '').toLowerCase();
  const fileCount = files.length;
  const images = files.filter(f => f.isImage && f.dataUrl);
  const textFiles = files.filter(f => f.isText && f.textContent);

  // Determine site vibe & genre from prompt
  const isEcommerce = query.includes('shop') || query.includes('store') || query.includes('product') || query.includes('cart') || query.includes('sneaker') || query.includes('buy');
  const isPortfolio = query.includes('portfolio') || query.includes('resume') || query.includes('designer') || query.includes('developer') || query.includes('cv');
  const isRestaurant = query.includes('food') || query.includes('restaurant') || query.includes('cafe') || query.includes('bistro') || query.includes('menu') || query.includes('dining');
  const isAgency = query.includes('agency') || query.includes('studio') || query.includes('creative') || query.includes('consulting');
  const isDark = query.includes('dark') || query.includes('cyber') || query.includes('neon') || query.includes('night') || query.includes('sleek');

  // Derive title & brand name
  let brandName = 'NextGen Studio';
  let tagline = 'Crafted from your ideas, files, and vision in real time';

  if (isEcommerce) {
    brandName = 'LUMEN Goods & Apparel';
    tagline = 'Curated essentials engineered for performance and style';
  } else if (isPortfolio) {
    brandName = 'Alex Rivera Portfolio';
    tagline = 'Product Designer & Full-Stack Engineer based in San Francisco';
  } else if (isRestaurant) {
    brandName = 'Aura Cucina & Bar';
    tagline = 'Seasonal artisanal flavors crafted with passion and heritage';
  } else if (isAgency) {
    brandName = 'VORTEX Digital Agency';
    tagline = 'We design digital brands, products, and immersive experiences';
  } else if (query.trim().length > 3) {
    // Generate intelligent brand from prompt words
    const words = message.replace(/[^a-zA-Z0-9 ]/g, '').split(/\s+/).filter(w => w.length > 2);
    if (words.length > 0) {
      brandName = words.slice(0, 2).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    }
  }

  // Hero headline
  const heroHeading = message.trim().length > 5
    ? (message.length > 60 ? message.substring(0, 60) + '...' : message)
    : (isEcommerce ? 'Minimalist Objects for Everyday Living' :
       isPortfolio ? 'Designing the Future of Interactive Systems' :
       isRestaurant ? 'A Symphony of Taste, Fire & Earth' :
       'Build, Scale & Automate Your Entire Digital Workflow');

  // Hero image or primary uploaded image
  const primaryImage = images.length > 0
    ? images[0].dataUrl
    : (isEcommerce
        ? 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1200&auto=format&fit=crop&q=80'
        : isRestaurant
        ? 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&auto=format&fit=crop&q=80'
        : isPortfolio
        ? 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?w=1200&auto=format&fit=crop&q=80'
        : 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=1200&auto=format&fit=crop&q=80');

  const secondaryImage = images.length > 1
    ? images[1].dataUrl
    : 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&auto=format&fit=crop&q=80';

  const tertiaryImage = images.length > 2
    ? images[2].dataUrl
    : 'https://images.unsplash.com/photo-1557804506-669a67965ba0?w=800&auto=format&fit=crop&q=80';

  // Text excerpt from uploaded files if any
  let fileNotes = '';
  if (textFiles.length > 0) {
    const snippet = (textFiles[0].textContent || '').slice(0, 200).replace(/\n/g, ' ');
    fileNotes = `Source document note: "${snippet}..."`;
  }

  // Background and theme classes
  const bgClass = isDark ? 'bg-slate-950 text-slate-100' : 'bg-white text-slate-900';
  const cardBg = isDark ? 'bg-slate-900/80 border-slate-800 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-800';
  const navBg = isDark ? 'bg-slate-950/80 border-slate-800' : 'bg-white/80 border-slate-100';
  const textMuted = isDark ? 'text-slate-400' : 'text-slate-600';
  const accentGradient = isDark
    ? 'from-indigo-400 via-purple-400 to-pink-400'
    : 'from-blue-600 via-indigo-600 to-violet-600';

  // Build the live reactive HTML
  return `<!DOCTYPE html>
<html lang="en" class="${isDark ? 'dark' : ''}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${brandName} - Live Real-Time Preview</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: { 50: '#eff6ff', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8' }
          }
        }
      }
    }
  </script>
  <style>
    @keyframes pulseGlow {
      0%, 100% { opacity: 0.4; }
      50% { opacity: 0.8; }
    }
    .glow-bg {
      animation: pulseGlow 6s infinite ease-in-out;
    }
  </style>
</head>
<body class="${bgClass} font-sans antialiased selection:bg-indigo-500 selection:text-white">

  <!-- Interactive Live Status Ribbon -->
  <aside aria-label="Real-time studio sync" class="sticky top-0 z-50 px-4 py-2 text-xs font-medium flex items-center justify-between border-b ${isDark ? 'bg-indigo-950/90 border-indigo-800 text-indigo-200' : 'bg-indigo-50/90 border-indigo-200 text-indigo-900'} backdrop-blur-md">
    <div class="flex items-center gap-2">
      <span class="relative flex h-2 w-2">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
      </span>
      <span>Live Preview Reactive Engine</span>
      ${fileCount > 0 ? `<span class="px-2 py-0.5 rounded-full text-[10px] bg-indigo-500/20 text-indigo-300 font-mono">${fileCount} asset${fileCount > 1 ? 's' : ''} mounted</span>` : ''}
    </div>
    <div class="hidden sm:flex items-center gap-3 text-[11px]">
      <span>Instant Sync Active</span>
      <button id="themeToggleBtn" class="px-2 py-0.5 rounded border border-indigo-300/40 hover:bg-indigo-500/20 transition-colors">
        <i class="fa-solid fa-moon mr-1"></i> Toggle Dark
      </button>
    </div>
  </aside>

  <!-- Navigation -->
  <header class="border-b ${navBg} backdrop-blur-md sticky top-8 z-40 transition-colors">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white font-bold shadow-md shadow-indigo-500/20">
          <i class="fa-solid fa-bolt text-sm"></i>
        </div>
        <span class="font-bold text-lg tracking-tight">${brandName}</span>
      </div>

      <nav class="hidden md:flex items-center gap-8 text-sm font-medium ${textMuted}">
        <a href="#features" class="hover:text-indigo-600 transition-colors">Features</a>
        <a href="#showcase" class="hover:text-indigo-600 transition-colors">${isEcommerce ? 'Collections' : isRestaurant ? 'Menu' : 'Showcase'}</a>
        <a href="#pricing" class="hover:text-indigo-600 transition-colors">${isRestaurant ? 'Reservations' : 'Pricing'}</a>
        <a href="#contact" class="hover:text-indigo-600 transition-colors">Contact</a>
      </nav>

      <div class="flex items-center gap-3">
        <button id="demoActionBtn" class="px-4 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-sm hover:shadow transition-all">
          ${isEcommerce ? 'View Cart (0)' : isRestaurant ? 'Book Table' : 'Get Started'}
        </button>
      </div>
    </div>
  </header>

  <!-- Hero Section -->
  <section class="relative overflow-hidden py-16 sm:py-24">
    <div class="absolute inset-0 pointer-events-none -z-10">
      <div class="glow-bg absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-blue-500/0 blur-3xl rounded-full"></div>
    </div>

    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        
        <div class="lg:col-span-7 space-y-6">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-600 border border-indigo-500/20">
            <i class="fa-solid fa-sparkles"></i>
            <span>${options?.isCloning ? 'Clone In-Progress' : 'AI Reactive Blueprint'}</span>
          </div>

          <h1 class="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-tight">
            <span class="bg-gradient-to-r ${accentGradient} bg-clip-text text-transparent">
              ${heroHeading}
            </span>
          </h1>

          <p class="text-lg sm:text-xl ${textMuted} max-w-2xl leading-relaxed">
            ${tagline}. ${fileNotes}
          </p>

          <div class="flex flex-wrap items-center gap-4 pt-2">
            <button onclick="alert('Welcome! Interactive prototype responsive.')" class="px-6 py-3 rounded-xl font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-2">
              <span>Explore Prototype</span>
              <i class="fa-solid fa-arrow-right text-xs"></i>
            </button>
            <a href="#showcase" class="px-6 py-3 rounded-xl font-semibold border ${isDark ? 'border-slate-700 hover:bg-slate-800 text-slate-200' : 'border-slate-300 hover:bg-slate-100 text-slate-700'} transition-all">
              Live Assets (${fileCount})
            </a>
          </div>

          <!-- Feature badges -->
          <div class="pt-6 grid grid-cols-3 gap-4 border-t ${isDark ? 'border-slate-800' : 'border-slate-200'}">
            <div>
              <div class="text-2xl font-bold text-indigo-600">99.8%</div>
              <div class="text-xs ${textMuted}">Design Fidelity</div>
            </div>
            <div>
              <div class="text-2xl font-bold text-indigo-600">&lt; 100ms</div>
              <div class="text-xs ${textMuted}">Interaction Latency</div>
            </div>
            <div>
              <div class="text-2xl font-bold text-indigo-600">Zero-Code</div>
              <div class="text-xs ${textMuted}">Clean Export</div>
            </div>
          </div>
        </div>

        <!-- Hero visual / Uploaded Image Slot -->
        <div class="lg:col-span-5">
          <div class="relative rounded-2xl overflow-hidden border ${isDark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-slate-50'} shadow-2xl shadow-indigo-500/10 group">
            <img 
              src="${primaryImage}" 
              alt="Primary Visual Reference"
              class="w-full h-80 sm:h-96 object-cover object-center group-hover:scale-105 transition-transform duration-500"
            />
            <div class="absolute inset-0 bg-gradient-to-t ${isDark ? 'from-slate-950/80 via-transparent' : 'from-slate-900/60 via-transparent'} flex items-end p-6">
              <div class="text-white">
                <span class="text-xs uppercase tracking-wider font-mono text-indigo-300">Live Asset Node</span>
                <p class="font-medium text-sm mt-1">${images.length > 0 ? images[0].name : 'Dynamic Visual Placeholder'}</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  </section>

  <!-- Showcase / Features Cards -->
  <section id="showcase" class="py-16 border-t ${isDark ? 'border-slate-800/80 bg-slate-950/50' : 'border-slate-100 bg-slate-50/50'}">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      
      <div class="text-center max-w-3xl mx-auto mb-12">
        <h2 class="text-2xl sm:text-3xl font-bold tracking-tight">Structured Content Architecture</h2>
        <p class="${textMuted} mt-2 text-sm sm:text-base">Synthesized automatically from your prompt instructions and uploaded files.</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        <!-- Card 1 -->
        <div class="p-6 rounded-2xl border ${cardBg} hover:-translate-y-1 transition-all duration-300 shadow-sm hover:shadow-md">
          <div class="w-12 h-12 rounded-xl bg-indigo-500/10 text-indigo-600 flex items-center justify-center text-xl mb-4">
            <i class="fa-solid fa-layer-group"></i>
          </div>
          <h3 class="text-lg font-bold mb-2">Adaptive Component Grid</h3>
          <p class="${textMuted} text-sm leading-relaxed mb-4">
            Mobile-first responsive layout structured with clean semantic Tailwind utility classes.
          </p>
          <img src="${secondaryImage}" alt="Secondary Asset" class="rounded-xl h-36 w-full object-cover">
        </div>

        <!-- Card 2 -->
        <div class="p-6 rounded-2xl border ${cardBg} hover:-translate-y-1 transition-all duration-300 shadow-sm hover:shadow-md">
          <div class="w-12 h-12 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center text-xl mb-4">
            <i class="fa-solid fa-code-compare"></i>
          </div>
          <h3 class="text-lg font-bold mb-2">Visual Clone Fidelity</h3>
          <p class="${textMuted} text-sm leading-relaxed mb-4">
            Recreates navigation bars, hero typography, color accents, and interactive cards accurately.
          </p>
          <img src="${tertiaryImage}" alt="Tertiary Asset" class="rounded-xl h-36 w-full object-cover">
        </div>

        <!-- Card 3 -->
        <div class="p-6 rounded-2xl border ${cardBg} hover:-translate-y-1 transition-all duration-300 shadow-sm hover:shadow-md">
          <div class="w-12 h-12 rounded-xl bg-purple-500/10 text-purple-600 flex items-center justify-center text-xl mb-4">
            <i class="fa-solid fa-wand-magic-sparkles"></i>
          </div>
          <h3 class="text-lg font-bold mb-2">Interactive JavaScript</h3>
          <p class="${textMuted} text-sm leading-relaxed mb-4">
            Includes functioning state handlers: toggle buttons, modal dialogs, and instant form submission.
          </p>
          <div class="p-4 rounded-xl border ${isDark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white'} space-y-2">
            <div class="flex justify-between items-center text-xs">
              <span class="font-mono">Interactive Toggle:</span>
              <button id="cardCounterBtn" class="px-2 py-1 rounded bg-indigo-600 text-white font-mono text-[11px]">Clicks: 0</button>
            </div>
            <div class="text-[11px] ${textMuted}">Click to test sandbox event listener</div>
          </div>
        </div>

      </div>
    </div>
  </section>

  <!-- Interactive Demo Contact / Action Section -->
  <section id="contact" class="py-16">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="p-8 sm:p-12 rounded-3xl border ${cardBg} shadow-xl relative overflow-hidden">
        <h3 class="text-2xl font-bold mb-2">Connect or Request a Consultation</h3>
        <p class="${textMuted} text-sm mb-6">Test the live form submission inside the sandbox.</p>
        
        <form id="contactForm" onsubmit="event.preventDefault(); alert('Demo Form Submitted Successfully!');" class="space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label class="block text-xs font-medium mb-1 ${textMuted}">Your Name</label>
              <input type="text" required placeholder="Alex Morgan" class="w-full px-4 py-2.5 rounded-xl border ${isDark ? 'border-slate-700 bg-slate-950 text-white' : 'border-slate-300 bg-white'} text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            </div>
            <div>
              <label class="block text-xs font-medium mb-1 ${textMuted}">Email Address</label>
              <input type="email" required placeholder="alex@company.com" class="w-full px-4 py-2.5 rounded-xl border ${isDark ? 'border-slate-700 bg-slate-950 text-white' : 'border-slate-300 bg-white'} text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
            </div>
          </div>
          <div>
            <label class="block text-xs font-medium mb-1 ${textMuted}">Message / Project Notes</label>
            <textarea rows="3" placeholder="Tell us what you'd like to build..." class="w-full px-4 py-2.5 rounded-xl border ${isDark ? 'border-slate-700 bg-slate-950 text-white' : 'border-slate-300 bg-white'} text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"></textarea>
          </div>
          <button type="submit" class="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm shadow transition-all">
            Send Message
          </button>
        </form>
      </div>
    </div>
  </section>

  <!-- Footer -->
  <footer class="border-t ${isDark ? 'border-slate-800' : 'border-slate-200'} py-8">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs ${textMuted}">
      <div class="flex items-center gap-2">
        <span class="font-bold tracking-tight text-indigo-500">${brandName}</span>
        <span>&copy; ${new Date().getFullYear()} All rights reserved.</span>
      </div>
      <div class="flex items-center gap-6">
        <a href="#" class="hover:underline">Privacy Policy</a>
        <a href="#" class="hover:underline">Terms of Service</a>
        <a href="#" class="hover:underline">Export Documentation</a>
      </div>
    </div>
  </footer>

  <!-- Script for Interactive Sandbox Features -->
  <script>
    // Theme toggle in preview
    const toggleBtn = document.getElementById('themeToggleBtn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        document.documentElement.classList.toggle('dark');
      });
    }

    // Interactive counter button
    const counterBtn = document.getElementById('cardCounterBtn');
    let clicks = 0;
    if (counterBtn) {
      counterBtn.addEventListener('click', () => {
        clicks++;
        counterBtn.textContent = 'Clicks: ' + clicks;
      });
    }
  </script>
</body>
</html>`;
}
