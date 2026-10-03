/* =====================================================================
   tools.js — Image Toolbox engine

   Fifteen real tools that run entirely in the visitor's browser, plus
   one pseudo-tool ("home") whose panel is the site introduction.
   No upload, no server, no tracking.

   Field types rendered by buildField():
     seg     segmented control (2-3 short options)
     menu    custom dropdown (any number of options)
     range   slider
     switch  on/off
     number  numeric input
     text    single-line text
   A field opts out with offWhen / onWhen so irrelevant controls grey out.
   offWhen is one condition or a list of them; onWhen is always one.
   offNote may be a function of the state, for a field with several reasons.
   ===================================================================== */
(function () {
  'use strict';

  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var G = window.gsap;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var IMG_ACCEPT = '.jpg,.jpeg,.png,.webp,.bmp,.gif';
  var IMG_HINT = '或点击选择 · 支持 JPG / PNG / WebP / BMP';
  var FMT_SEG = [
    ['image/jpeg', 'JPEG'], ['image/png', 'PNG'], ['image/webp', 'WebP']
  ];

  /* ------------------------------------------------------------------ util */
  function fmtBytes(n) {
    if (!isFinite(n) || n <= 0) return '0 B';
    var u = ['B', 'KB', 'MB', 'GB'];
    var i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
    var v = n / Math.pow(1024, i);
    return (i === 0 ? v : v.toFixed(v < 10 ? 1 : 0)) + ' ' + u[i];
  }
  function stem(name) { var i = name.lastIndexOf('.'); return i > 0 ? name.slice(0, i) : name; }
  function sanitize(name) { return name.replace(/[\\/:*?"<>|]+/g, '_'); }

  var MIME_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

  function fileToImage(file) {
    return new Promise(function (res, rej) {
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () { URL.revokeObjectURL(url); res(img); };
      img.onerror = function () { URL.revokeObjectURL(url); rej(new Error('无法解码：' + file.name)); };
      img.src = url;
    });
  }

  function toBlob(canvas, type, quality) {
    return new Promise(function (res) {
      var done = function (b) { res(b || null); };
      if (type === 'image/png') { canvas.toBlob(done, 'image/png'); return; }
      canvas.toBlob(done, type, quality);
    });
  }

  function newCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }

  function ctx2d(c) {
    var x = c.getContext('2d');
    x.imageSmoothingEnabled = true;
    x.imageSmoothingQuality = 'high';
    return x;
  }

  function renderTo(img, w, h, bg) {
    var c = newCanvas(w, h);
    var x = ctx2d(c);
    if (bg) { x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height); }
    x.drawImage(img, 0, 0, c.width, c.height);
    return c;
  }

  function fitWidth(img, maxW) {
    if (!maxW || img.naturalWidth <= maxW) return { w: img.naturalWidth, h: img.naturalHeight };
    return { w: maxW, h: Math.round(img.naturalHeight * (maxW / img.naturalWidth)) };
  }

  function blobToDataUrl(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(r.result); };
      r.onerror = function () { rej(new Error('读取失败')); };
      r.readAsDataURL(blob);
    });
  }

  /* "1-" | "2" | "1-3,7"  ->  [0-based page indexes] */
  function parsePages(spec, total) {
    var out = [];
    spec = String(spec || '').trim();
    if (!spec) return null;
    var parts = spec.split(/[,，]/);
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim();
      if (!p) continue;
      var m = p.match(/^(\d+)\s*[-–~]\s*(\d+)?$/);
      if (m) {
        var a = Math.max(1, parseInt(m[1], 10));
        var b = m[2] ? Math.min(total, parseInt(m[2], 10)) : total;
        if (b < a) { var t = a; a = b; b = t; }
        for (var k = a; k <= b; k++) if (k >= 1 && k <= total) out.push(k - 1);
      } else if (/^\d+$/.test(p)) {
        var n = parseInt(p, 10);
        if (n >= 1 && n <= total) out.push(n - 1);
      }
    }
    if (!out.length) return null;
    return out.filter(function (v, idx, arr) { return arr.indexOf(v) === idx; });
  }

  /* ------------------------------------------------------- type for canvas */
  /* The watermark has to be drawn with the same face the page uses, and the
     face arrives from a CDN after first paint. Drawing before then silently
     falls back to whatever local CJK font the OS has, so the one thing a
     watermark tool must get right is waiting for it. Cached either way — the
     promise is only ever awaited, never rebuilt. */
  var CJK_STACK = '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
  var fontsPromise = null;
  function fontsReady() {
    if (fontsPromise) return fontsPromise;
    fontsPromise = (document.fonts && document.fonts.ready)
      ? document.fonts.ready.catch(function () {})
      : Promise.resolve();
    return fontsPromise;
  }

  /* ------------------------------------------------------ write a PDF (12) */
  /* A PDF is a small grammar of objects plus a cross-reference table whose
     entries are byte offsets into the finished file. The whole thing is
     therefore assembled as bytes with a running cursor — never as a string:
     the page images are raw JPEG payloads, and a string would hand those to
     the text encoder on the way out.

     Each page is a Form XObject-free page that places one DCTDecode image,
     which is the single image filter every reader implements and the one
     canvas already hands us. */
  var A4_SHORT = 595.28, A4_LONG = 841.89;   /* A4 in points, 72dpi */

  function pdfBytes(s) {
    var out = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
    return out;
  }

  function buildPdf(pages, mode, margin) {
    /* object numbering: 1 catalog, 2 pages, then per page i (0-based):
       3+3i page, 4+3i contents, 5+3i image. */
    var n = pages.length;
    var last = 2 + n * 3;
    var chunks = [];
    var cursor = 0;

    function put(bytes) { chunks.push(bytes); cursor += bytes.length; }
    function putStr(s) { put(pdfBytes(s)); }
    function beginObj(num) { putStr(num + ' 0 obj\n'); }
    function endObj() { putStr('endobj\n'); }

    putStr('%PDF-1.4\n');
    /* a binary comment marks the file as binary for anything that sniffs it */
    put(new Uint8Array([0x25, 0xE2, 0xE3, 0xCF, 0xD3, 0x0A]));

    var offsets = new Array(last + 1);

    offsets[1] = cursor;
    beginObj(1);
    putStr('<< /Type /Catalog /Pages 2 0 R >>\n');
    endObj();

    offsets[2] = cursor;
    beginObj(2);
    var kids = [], i;
    for (i = 0; i < n; i++) kids.push((3 + i * 3) + ' 0 R');
    putStr('<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + n + ' >>\n');
    endObj();

    for (i = 0; i < n; i++) {
      var pg = pages[i];
      var pageW, pageH, dw, dh, dx, dy;

      if (mode === 'fit') {
        /* the page is the image, point for point — the margin control is greyed
           out in this mode, so honouring it here would bake in a border the
           user can no longer see or change */
        pageW = Math.max(1, pg.w);
        pageH = Math.max(1, pg.h);
        dw = pg.w; dh = pg.h;
        dx = 0; dy = 0;
      } else {
        pageW = (mode === 'a4h') ? A4_LONG : A4_SHORT;
        pageH = (mode === 'a4h') ? A4_SHORT : A4_LONG;
        var availW = Math.max(1, pageW - margin * 2);
        var availH = Math.max(1, pageH - margin * 2);
        var k = Math.min(availW / pg.w, availH / pg.h);
        dw = pg.w * k; dh = pg.h * k;
        dx = (pageW - dw) / 2; dy = (pageH - dh) / 2;
      }

      var pNum = 3 + i * 3, cNum = pNum + 1, iNum = pNum + 2;

      offsets[pNum] = cursor;
      beginObj(pNum);
      putStr('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' +
        r3(pageW) + ' ' + r3(pageH) + '] /Resources << /XObject << /Im0 ' +
        iNum + ' 0 R >> /ProcSet [/PDF /ImageC] >> /Contents ' + cNum + ' 0 R >>\n');
      endObj();

      /* the content stream is one image, scaled into the box and centred */
      var stream = 'q\n' + r3(dw) + ' 0 0 ' + r3(dh) + ' ' + r3(dx) + ' ' + r3(dy) + ' cm\n/Im0 Do\nQ\n';
      offsets[cNum] = cursor;
      beginObj(cNum);
      putStr('<< /Length ' + stream.length + ' >>\nstream\n');
      putStr(stream);
      putStr('endstream\n');
      endObj();

      offsets[iNum] = cursor;
      beginObj(iNum);
      putStr('<< /Type /XObject /Subtype /Image /Width ' + pg.w + ' /Height ' + pg.h +
        ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' +
        pg.jpg.length + ' >>\nstream\n');
      put(pg.jpg);
      putStr('\nendstream\n');
      endObj();
    }

    var xref = cursor;
    putStr('xref\n0 ' + (last + 1) + '\n');
    putStr('0000000000 65535 f \n');
    for (i = 1; i <= last; i++) {
      putStr(pad10(offsets[i]) + ' 00000 n \n');
    }
    putStr('trailer\n<< /Size ' + (last + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');

    var size = cursor, out = new Uint8Array(size), at = 0, j;
    for (j = 0; j < chunks.length; j++) { out.set(chunks[j], at); at += chunks[j].length; }
    return new Blob([out], { type: 'application/pdf' });
  }

  /* three decimals, no exponent — a MediaBox with 6.4e2 in it is legal but
     every reader's parser has to be trusted for nothing */
  function r3(v) { return (Math.round(v * 1000) / 1000).toFixed(3); }
  function pad10(v) { var s = String(v); while (s.length < 10) s = '0' + s; return s; }

  /* ------------------------------------------------------------- pdf.js load */
  var PDF_SRC = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js';
  var PDF_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
  var pdfPromise = null;

  function loadPdf() {
    if (pdfPromise) return pdfPromise;
    pdfPromise = new Promise(function (res, rej) {
      if (window.pdfjsLib) return res(window.pdfjsLib);
      var s = document.createElement('script');
      s.src = PDF_SRC;
      s.async = true;
      s.onload = function () {
        if (!window.pdfjsLib) return rej(new Error('pdf.js 加载失败'));
        try {
          // Under file:// a cross-origin worker is usually blocked, and a
          // blocked worker means no PDF at all. Leaving workerSrc unset makes
          // pdf.js fall back to its main-thread worker, which always works.
          if (location.protocol !== 'file:') {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
          }
        } catch (e) {}
        res(window.pdfjsLib);
      };
      s.onerror = function () { rej(new Error('无法加载 pdf.js，请检查网络')); };
      document.head.appendChild(s);
    });
    return pdfPromise;
  }

  /* =================================================================== TOOLS */

  /* 00 — the site itself, not a tool. Its panel is an introduction.
     首屏已经把「十四个工具 / 一次都不上传」说掉了，这一块只补首屏没说的
     那一件事：这些运算具体是在哪儿跑的。lines 留空，大字不重复第二遍。 */
  var HOME = {
    id: 'home', theme: '0', index: '00', kind: 'home',
    title: '关于这个站点',
    desc: '这一页是工具台。选一个工具进去，或者从下面的索引直接进。',
    fields: [],
    lines: [],
    body: [
      '压缩、转码、裁剪、旋转、调色、遮罩、模糊、拼图、拼 PDF、加字、加边框 —— 用到的都是 Canvas、File 和浏览器自带的能力。文件从你手里进去，处理完回到你手里，中间不经过任何第三方。',
      '关掉这个页面，什么都不会被留下：没有上传队列，没有账号，也不需要等待。'
    ],
    promise: ['不追踪', '不注册', '不联网', '不留缓存']
  };

  var TOOLS = {

    /* ---------------------------------------------------------- 01 compress */
    /* Two ways to want a file to be smaller, so they are one tool with a mode
       switch rather than two near-identical panels.
         quality — you say how good, it tells you how small
         size    — you say how big, it spends quality and then resolution
       Both walk the same ladder; only the stopping rule differs. */
    compress: {
      id: 'compress', theme: '1', index: '01',
      title: '图片压缩',
      desc: '按画质压，或者直接给一个目标体积让它自己权衡。两种都在本地跑。',
      accept: 'image/*',
      acceptAttr: IMG_ACCEPT,
      dropTitle: '拖入图片',
      dropSub: IMG_HINT,
      runLabel: '开始压缩',
      fields: [
        { type: 'seg', key: 'mode', label: '压缩方式', value: 'quality',
          options: [['quality', '按画质'], ['size', '按体积']],
          note: '按画质由你定质量、体积随之而来；按体积由你定体积，它先降画质，画质见底了再降尺寸' },
        { type: 'seg', key: 'format', label: '输出格式', value: 'image/jpeg',
          options: [['image/jpeg', 'JPEG'], ['image/webp', 'WebP'], ['image/png', 'PNG']] },
        { type: 'range', key: 'quality', label: '压缩质量', min: 10, max: 100, step: 1, value: 72,
          fmt: function (v) { return v + '%'; },
          offWhen: [{ key: 'mode', values: ['size'] },
                    { key: 'format', values: ['image/png'] }],
          offNote: function (s) {
            return s.opts.format === 'image/png'
              ? 'PNG 为无损格式，此项不生效'
              : '已切到「按体积」，画质交给目标大小决定';
          } },
        { type: 'number', key: 'target', label: '目标大小', value: 300, min: 10, max: 20480, unit: 'KB',
          onWhen: { key: 'mode', values: ['size'] },
          note: '达不到时会压到当前格式的极限，并在文件名里标出还差多少' },
        { type: 'menu', key: 'maxW', label: '最大宽度', value: '0',
          options: [['0', '原始尺寸'], ['2560', '2560 px'], ['1920', '1920 px'], ['1280', '1280 px'], ['800', '800 px']] }
      ],
      run: function (ctx) {
        var o = ctx.opts;
        var f = o.format, maxW = parseInt(o.maxW, 10) || 0;
        var bySize = o.mode === 'size';
        var target = Math.max(10, parseInt(o.target, 10) || 300) * 1024;
        var q = o.quality / 100;

        if (!bySize) {
          return ctx.each(function (file) {
            return fileToImage(file).then(function (img) {
              var d = fitWidth(img, maxW);
              var bg = (f === 'image/jpeg') ? '#ffffff' : null;
              return toBlob(renderTo(img, d.w, d.h, bg), f, q);
            }).then(function (blob) {
              if (!blob) throw new Error('编码失败：' + file.name);
              return { blob: blob, before: file.size, name: stem(file.name) + '-min.' + (MIME_EXT[blob.type] || 'png') };
            });
          });
        }

        /* quality ladder: 10 steps of 8 points from 92 down to 20, then give up
           on quality and start eating resolution instead. PNG has no quality
           axis at all, so it skips straight to the resolution steps — the
           attempt index is clamped, so a one-step ladder just stays on it. */
        var LADDER = (f === 'image/png') ? [92] : [92, 84, 76, 68, 60, 52, 44, 36, 28, 20];
        var SHRINK = [1, 0.85, 0.72, 0.61, 0.52];

        return ctx.each(function (file) {
          return fileToImage(file).then(function (img) {
            var d = fitWidth(img, maxW);
            var best = null;

            function attempt(k, i) {
              var q2 = LADDER[Math.min(i, LADDER.length - 1)] / 100;
              var c = renderTo(img, d.w, d.h, (f === 'image/jpeg') ? '#ffffff' : null);
              return toBlob(c, f, q2).then(function (blob) {
                if (!blob) throw new Error('编码失败：' + file.name);
                if (!best || blob.size < best.size) best = blob;
                if (blob.size <= target) return true;
                if (i < LADDER.length - 1) return attempt(k, i + 1);
                if (k < SHRINK.length - 1) {
                  d = { w: Math.max(1, Math.round(d.w * SHRINK[k + 1])),
                        h: Math.max(1, Math.round(d.h * SHRINK[k + 1])) };
                  /* back up to a respectable quality on the smaller canvas:
                     a shrunken image encoded at 20 looks worse than the same
                     image at 76, and it may already be under target anyway */
                  return attempt(k + 1, 2);
                }
                return false;
              });
            }
            return attempt(0, 0).then(function () { return best; });
          }).then(function (blob) {
            if (!blob) throw new Error('压缩失败：' + file.name);
            var tag = blob.size <= target ? 'fit' : 'min';
            return { blob: blob, before: file.size,
                     name: stem(file.name) + '-' + tag + '-' + Math.round(blob.size / 1024) + 'k.' + (MIME_EXT[blob.type] || 'jpg') };
          });
        });
      }
    },

    /* ----------------------------------------------------------- 02 convert */
    format: {
      id: 'format', theme: '2', index: '02',
      title: '图片格式转换',
      desc: '在 PNG / JPEG / WebP 之间互转，保持原始尺寸，支持批量处理。',
      accept: 'image/*',
      acceptAttr: IMG_ACCEPT,
      dropTitle: '拖入图片',
      dropSub: IMG_HINT,
      runLabel: '开始转换',
      fields: [
        { type: 'seg', key: 'format', label: '目标格式', value: 'image/webp',
          options: [['image/webp', 'WebP'], ['image/jpeg', 'JPEG'], ['image/png', 'PNG']] },
        { type: 'range', key: 'quality', label: '输出质量', min: 10, max: 100, step: 1, value: 90,
          fmt: function (v) { return v + '%'; },
          offWhen: { key: 'format', values: ['image/png'] },
          offNote: 'PNG 为无损格式，此项不生效' },
        { type: 'switch', key: 'flatten', label: '为透明区域填白', value: false,
          note: '转成 JPEG 时透明处会变黑，勾上则填白底' },
        { type: 'range', key: 'maxW', label: '最大宽度', min: 0, max: 8000, step: 80, value: 0,
          fmt: function (v) { return v ? v + ' px' : '原始尺寸'; } }
      ],
      run: function (ctx) {
        var f = ctx.opts.format, q = ctx.opts.quality / 100;
        var maxW = parseInt(ctx.opts.maxW, 10) || 0;
        var bg = ctx.opts.flatten ? '#ffffff' : (f === 'image/jpeg' ? '#ffffff' : null);
        return ctx.each(function (file) {
          return fileToImage(file).then(function (img) {
            var d = fitWidth(img, maxW);
            return toBlob(renderTo(img, d.w, d.h, bg), f, q);
          }).then(function (blob) {
            if (!blob) throw new Error('转换失败：' + file.name);
            return { blob: blob, before: file.size, name: stem(file.name) + '.' + (MIME_EXT[blob.type] || 'png') };
          });
        });
      }
    },

    /* -------------------------------------------------------------- 03 pdf */
    pdf: {
      id: 'pdf', theme: '3', index: '03',
      title: 'PDF 转图片',
      desc: '把 PDF 的每一页渲染成 PNG 或 JPEG，页码可自由挑选，整个过程不离开这台设备。',
      accept: 'application/pdf,.pdf',
      acceptAttr: '.pdf',
      dropTitle: '拖入 PDF',
      dropSub: '或点击选择 · 支持单个或多个文件',
      runLabel: '开始转换',
      fields: [
        { type: 'text', key: 'pages', label: '页码范围', value: '1-',
          placeholder: '例如 1-3,7',
          note: '留空或填 1- 表示全部页面' },
        { type: 'seg', key: 'scale', label: '渲染精度', value: '2',
          options: [['1', '1x'], ['2', '2x'], ['3', '3x']] },
        { type: 'seg', key: 'format', label: '输出格式', value: 'image/png',
          options: [['image/png', 'PNG'], ['image/jpeg', 'JPEG']] }
      ],
      run: function (ctx) {
        var lib0 = loadPdf();
        var scale = parseFloat(ctx.opts.scale) || 2;
        var type = ctx.opts.format;
        var pageSpec = ctx.opts.pages;

        return ctx.each(function (file) {
          return lib0.then(function (lib) {
            return file.arrayBuffer().then(function (buf) {
              return lib.getDocument({ data: buf }).promise;
            }).then(function (doc) {
              var picks = parsePages(pageSpec, doc.numPages);
              if (!picks) {
                picks = [];
                for (var i = 0; i < doc.numPages; i++) picks.push(i);
              }
              if (!picks.length) throw new Error(file.name + ' 里没有可转换的页面');

              return picks.reduce(function (chain, pi) {
                return chain.then(function (acc) {
                  return doc.getPage(pi + 1).then(function (page) {
                    var vp = page.getViewport({ scale: scale });
                    var canvas = document.createElement('canvas');
                    canvas.width = Math.ceil(vp.width);
                    canvas.height = Math.ceil(vp.height);
                    var cx = canvas.getContext('2d');
                    cx.fillStyle = '#ffffff';
                    cx.fillRect(0, 0, canvas.width, canvas.height);
                    return page.render({ canvasContext: cx, viewport: vp }).promise.then(function () {
                      return toBlob(canvas, type, 0.92);
                    }).then(function (blob) {
                      var pad = ('000' + (pi + 1)).slice(-3);
                      acc.push({
                        blob: blob,
                        name: stem(file.name) + '-p' + pad + '.' + (MIME_EXT[blob.type] || 'png')
                        // per-page output: a size delta against the PDF is meaningless
                      });
                      return acc;
                    });
                  });
                });
              }, Promise.resolve([]));
            });
          });
        });
      }
    },

    /* ----------------------------------------------------------- 04 resize */
    resize: {
      id: 'resize', theme: '4', index: '04',
      title: '图片尺寸调整',
      desc: '按百分比或精确像素重新设定图片尺寸，锁定比例以免画面变形。',
      accept: 'image/*',
      acceptAttr: IMG_ACCEPT,
      dropTitle: '拖入图片',
      dropSub: IMG_HINT,
      runLabel: '开始调整',
      fields: [
        { type: 'menu', key: 'mode', label: '调整方式', value: 'percent',
          options: [['percent', '按百分比'], ['width', '按宽度'], ['height', '按高度'], ['exact', '精确尺寸']] },
        { type: 'range', key: 'pct', label: '缩放比例', min: 5, max: 200, step: 5, value: 50,
          fmt: function (v) { return v + '%'; },
          onWhen: { key: 'mode', values: ['percent'] } },
        { type: 'number', key: 'w', label: '宽度', value: 1200, min: 1, max: 20000, unit: 'px',
          onWhen: { key: 'mode', values: ['width', 'height', 'exact'] } },
        { type: 'number', key: 'h', label: '高度', value: 1200, min: 1, max: 20000, unit: 'px',
          onWhen: { key: 'mode', values: ['width', 'height', 'exact'] } },
        { type: 'switch', key: 'lock', label: '锁定宽高比', value: true,
          onWhen: { key: 'mode', values: ['width', 'height', 'exact'] } },
        { type: 'seg', key: 'format', label: '输出格式', value: 'image/png',
          options: [['image/png', 'PNG'], ['image/jpeg', 'JPEG'], ['image/webp', 'WebP']] }
      ],
      run: function (ctx) {
        var o = ctx.opts;
        var mode = o.mode, lock = o.lock;
        var w = parseInt(o.w, 10) || 1, h = parseInt(o.h, 10) || 1, p = (parseInt(o.pct, 10) || 100) / 100;

        return ctx.each(function (file) {
          return fileToImage(file).then(function (img) {
            var nw, nh, iw = img.naturalWidth, ih = img.naturalHeight;
            if (mode === 'percent') { nw = iw * p; nh = ih * p; }
            else if (mode === 'width') { nw = w; nh = ih * (w / iw); }
            else if (mode === 'height') { nh = h; nw = iw * (h / ih); }
            else if (lock && iw && ih) { nw = w; nh = w / (iw / ih); }
            else { nw = w; nh = h; }
            var bg = o.format === 'image/jpeg' ? '#ffffff' : null;
            return toBlob(renderTo(img, nw, nh, bg), o.format, 0.92);
          }).then(function (blob) {
            if (!blob) throw new Error('调整失败：' + file.name);
            return { blob: blob, before: file.size, name: stem(file.name) + '-' + blob.size + '.' + (MIME_EXT[blob.type] || 'png') };
          });
        });
      }
    },

    /* ----------------------------------------------------------- 05 base64 */
    base64: {
      id: 'base64', theme: '5', index: '05',
      title: 'Base64 编解码',
      desc: '把任意文件编码成 Base64 文本，或把 Base64 文本还原回文件。适合塞进 JSON、邮件或数据库字段。',
      accept: '*/*',
      acceptAttr: '',
      dropTitle: '拖入文件',
      dropSub: '或点击选择 · 任意类型，不限大小',
      runLabel: '开始编码',
      fields: [
        { type: 'seg', key: 'mode', label: '模式', value: 'encode',
          options: [['encode', '文件 → Base64'], ['decode', 'Base64 → 文件']] }
      ],
      custom: true
    },

    /* ------------------------------------------------------------- 06 crop */
    crop: {
      id: 'crop', theme: '6', index: '06',
      title: '图片裁剪',
      desc: '按固定比例从中心裁掉多余画面，或只锁定输出宽度重新采样。支持批量处理。',
      accept: 'image/*',
      acceptAttr: IMG_ACCEPT,
      dropTitle: '拖入图片',
      dropSub: IMG_HINT,
      runLabel: '开始裁剪',
      fields: [
        { type: 'seg', key: 'ratio', label: '裁剪比例', value: '1:1',
          options: [['1:1', '1:1'], ['4:3', '4:3'], ['3:4', '3:4'], ['16:9', '16:9'], ['9:16', '9:16'], ['free', '不裁剪']] },
        { type: 'range', key: 'w', label: '输出宽度', min: 0, max: 8000, step: 80, value: 1200,
          fmt: function (v) { return v ? v + ' px' : '原始宽度'; } },
        { type: 'seg', key: 'format', label: '输出格式', value: 'image/jpeg', options: FMT_SEG }
      ],
      run: function (ctx) {
        var o = ctx.opts;
        var f = o.format, targetW = parseInt(o.w, 10) || 0;
        var R = { '1:1': [1, 1], '4:3': [4, 3], '3:4': [3, 4], '16:9': [16, 9], '9:16': [9, 16] };
        var box = R[o.ratio];

        return ctx.each(function (file) {
          return fileToImage(file).then(function (img) {
            var iw = img.naturalWidth, ih = img.naturalHeight;
            var rw = iw, rh = ih;
            if (box) {
              var t = box[0] / box[1], cur = iw / ih;
              if (cur > t) { rw = Math.round(ih * t); }
              else { rh = Math.round(iw / t); }
            }
            var k = targetW > 0 ? targetW / rw : 1;
            var ow = Math.max(1, Math.round(rw * k)), oh = Math.max(1, Math.round(rh * k));
            var c = newCanvas(ow, oh);
            var cx = ctx2d(c);
            if (f === 'image/jpeg') { cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, ow, oh); }
            cx.drawImage(img, (iw - rw) / 2, (ih - rh) / 2, rw, rh, 0, 0, ow, oh);
            return toBlob(c, f, 0.92);
          }).then(function (blob) {
            if (!blob) throw new Error('裁剪失败：' + file.name);
            return { blob: blob, before: file.size, name: stem(file.name) + '-crop.' + (MIME_EXT[blob.type] || 'png') };
          });
        });
      }
    },

    /* ----------------------------------------------------------- 07 rotate */
    rotate: {
      id: 'rotate', theme: '7', index: '07',
      title: '旋转与翻转',
      desc: '按 90° 步进旋转，或做水平、垂直镜像。90° 与 270° 会自动交换宽高。',
      accept: 'image/*',
      acceptAttr: IMG_ACCEPT,
      dropTitle: '拖入图片',
      dropSub: IMG_HINT,
      runLabel: '开始旋转',
      fields: [
        { type: 'seg', key: 'rot', label: '旋转角度', value: '0',
          options: [['0', '不旋转'], ['90', '90°'], ['180', '180°'], ['270', '270°']] },
        { type: 'switch', key: 'flipH', label: '水平镜像', value: false },
        { type: 'switch', key: 'flipV', label: '垂直镜像', value: false },
        { type: 'seg', key: 'format', label: '输出格式', value: 'image/png', options: FMT_SEG }
      ],
      run: function (ctx) {
        var o = ctx.opts;
        var rot = parseInt(o.rot, 10) || 0, f = o.format;
        return ctx.each(function (file) {
          return fileToImage(file).then(function (img) {
            var iw = img.naturalWidth, ih = img.naturalHeight;
            var swap = (rot === 90 || rot === 270);
            var c = newCanvas(swap ? ih : iw, swap ? iw : ih);
            var cx = ctx2d(c);
            if (f === 'image/jpeg') { cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, c.width, c.height); }
            cx.save();
            cx.translate(c.width / 2, c.height / 2);
            cx.rotate(rot * Math.PI / 180);
            cx.scale(o.flipH ? -1 : 1, o.flipV ? -1 : 1);
            cx.drawImage(img, -iw / 2, -ih / 2, iw, ih);
            cx.restore();
            return toBlob(c, f, 0.92);
          }).then(function (blob) {
            if (!blob) throw new Error('旋转失败：' + file.name);
            return { blob: blob, before: file.size, name: stem(file.name) + '-rot.' + (MIME_EXT[blob.type] || 'png') };
          });
        });
      }
    },

    /* ----------------------------------------------------------- 08 adjust */
    adjust: {
      id: 'adjust', theme: '8', index: '08',
      title: '色彩调整',
      desc: '在浏览器里调亮度、对比度与饱和度，或直接转成黑白。全部走 GPU 合成，实时出图。',
      accept: 'image/*',
      acceptAttr: IMG_ACCEPT,
      dropTitle: '拖入图片',
      dropSub: IMG_HINT,
      runLabel: '开始调整',
      fields: [
        { type: 'range', key: 'bright', label: '亮度', min: 40, max: 180, step: 2, value: 100,
          fmt: function (v) { return v + '%'; } },
        { type: 'range', key: 'contrast', label: '对比度', min: 40, max: 180, step: 2, value: 100,
          fmt: function (v) { return v + '%'; } },
        { type: 'range', key: 'saturate', label: '饱和度', min: 0, max: 220, step: 5, value: 100,
          fmt: function (v) { return v + '%'; } },
        { type: 'switch', key: 'gray', label: '转为黑白', value: false,
          note: '勾上后饱和度与色相不再起作用' },
        { type: 'seg', key: 'format', label: '输出格式', value: 'image/jpeg', options: FMT_SEG }
      ],
      run: function (ctx) {
        var o = ctx.opts, f = o.format;
        return ctx.each(function (file) {
          return fileToImage(file).then(function (img) {
            var c = newCanvas(img.naturalWidth, img.naturalHeight);
            var cx = ctx2d(c);
            if (f === 'image/jpeg') { cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, c.width, c.height); }
            cx.filter = o.gray
              ? 'grayscale(1) brightness(' + o.bright + '%) contrast(' + o.contrast + '%)'
              : 'brightness(' + o.bright + '%) contrast(' + o.contrast + '%) saturate(' + o.saturate + '%)';
            cx.drawImage(img, 0, 0, c.width, c.height);
            cx.filter = 'none';
            return toBlob(c, f, 0.92);
          }).then(function (blob) {
            if (!blob) throw new Error('调整失败：' + file.name);
            return { blob: blob, before: file.size, name: stem(file.name) + '-grade.' + (MIME_EXT[blob.type] || 'png') };
          });
        });
      }
    },

    /* ------------------------------------------------------------ 09 round */
    round: {
      id: 'round', theme: '9', index: '09',
      title: '圆角与遮罩',
      desc: '给图片加圆角，或裁成圆形、椭圆。透明区域会真正透明，建议输出 PNG。',
      accept: 'image/*',
      acceptAttr: IMG_ACCEPT,
      dropTitle: '拖入图片',
      dropSub: IMG_HINT,
      runLabel: '开始处理',
      fields: [
        { type: 'seg', key: 'shape', label: '形状', value: 'rounded',
          options: [['rounded', '圆角矩形'], ['circle', '圆形 / 椭圆']] },
        { type: 'range', key: 'radius', label: '圆角大小', min: 0, max: 50, step: 1, value: 12,
          fmt: function (v) { return v + '%'; },
          onWhen: { key: 'shape', values: ['rounded'] } },
        { type: 'seg', key: 'format', label: '输出格式', value: 'image/png',
          options: [['image/png', 'PNG'], ['image/jpeg', 'JPEG'], ['image/webp', 'WebP']] }
      ],
      run: function (ctx) {
        var o = ctx.opts, f = o.format;
        return ctx.each(function (file) {
          return fileToImage(file).then(function (img) {
            var W = img.naturalWidth, H = img.naturalHeight;
            var c = newCanvas(W, H);
            var cx = ctx2d(c);
            if (f === 'image/jpeg') { cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, W, H); }
            cx.beginPath();
            if (o.shape === 'circle') {
              cx.ellipse(W / 2, H / 2, W / 2, H / 2, 0, 0, Math.PI * 2);
            } else {
              var r = Math.round(Math.min(W, H) * (parseInt(o.radius, 10) || 0) / 100);
              if (r > 0 && cx.roundRect) { cx.roundRect(0, 0, W, H, r); }
              else if (r > 0) {
                cx.moveTo(r, 0);
                cx.arcTo(W, 0, W, H, r); cx.arcTo(W, H, 0, H, r);
                cx.arcTo(0, H, 0, 0, r); cx.arcTo(0, 0, W, 0, r);
                cx.closePath();
              } else { cx.rect(0, 0, W, H); }
            }
            cx.closePath();
            cx.clip();
            cx.drawImage(img, 0, 0, W, H);
            return toBlob(c, f, 0.92);
          }).then(function (blob) {
            if (!blob) throw new Error('处理失败：' + file.name);
            return { blob: blob, before: file.size, name: stem(file.name) + '-round.' + (MIME_EXT[blob.type] || 'png') };
          });
        });
      }
    },

    /* ------------------------------------------------------------- 10 blur */
    blur: {
      id: 'blur', theme: '10', index: '10',
      title: '模糊与马赛克',
      desc: '高斯柔化，或者把画面打成像素块。用来打码、抹掉水印前的背景都可以。',
      accept: 'image/*',
      acceptAttr: IMG_ACCEPT,
      dropTitle: '拖入图片',
      dropSub: IMG_HINT,
      runLabel: '开始处理',
      fields: [
        { type: 'seg', key: 'mode', label: '方式', value: 'blur',
          options: [['blur', '高斯模糊'], ['pixel', '马赛克']] },
        { type: 'range', key: 'soft', label: '模糊半径', min: 0, max: 40, step: 1, value: 6,
          fmt: function (v) { return v + ' px'; },
          onWhen: { key: 'mode', values: ['blur'] } },
        { type: 'range', key: 'block', label: '色块大小', min: 2, max: 80, step: 2, value: 16,
          fmt: function (v) { return v + ' px'; },
          onWhen: { key: 'mode', values: ['pixel'] } },
        { type: 'seg', key: 'format', label: '输出格式', value: 'image/jpeg', options: FMT_SEG }
      ],
      run: function (ctx) {
        var o = ctx.opts, f = o.format;
        return ctx.each(function (file) {
          return fileToImage(file).then(function (img) {
            var W = img.naturalWidth, H = img.naturalHeight;
            var c = newCanvas(W, H);
            var cx = ctx2d(c);
            if (f === 'image/jpeg') { cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, W, H); }

            if (o.mode === 'pixel') {
              var b = Math.max(2, parseInt(o.block, 10) || 16);
              var small = newCanvas(Math.max(1, Math.round(W / b)), Math.max(1, Math.round(H / b)));
              var sx = ctx2d(small);
              sx.drawImage(img, 0, 0, small.width, small.height);
              cx.imageSmoothingEnabled = false;
              cx.drawImage(small, 0, 0, W, H);
            } else {
              cx.filter = 'blur(' + (parseInt(o.soft, 10) || 0) + 'px)';
              cx.drawImage(img, 0, 0, W, H);
              cx.filter = 'none';
            }
            return toBlob(c, f, 0.92);
          }).then(function (blob) {
            if (!blob) throw new Error('处理失败：' + file.name);
            return { blob: blob, before: file.size, name: stem(file.name) + '-soft.' + (MIME_EXT[blob.type] || 'png') };
          });
        });
      }
    },

    /* ----------------------------------------------------------- 11 stitch */
    stitch: {
      id: 'stitch', theme: '11', index: '11',
      title: '拼接长图',
      desc: '把队列里的多张图拼成一张，横向或纵向，间距与底色可调。小图会居中排布。',
      accept: 'image/*',
      acceptAttr: IMG_ACCEPT,
      dropTitle: '拖入多张图片',
      dropSub: '按列表顺序拼接 · 至少 2 张',
      runLabel: '开始拼接',
      fields: [
        { type: 'seg', key: 'dir', label: '拼接方向', value: 'v',
          options: [['v', '纵向（从上到下）'], ['h', '横向（从左到右）']] },
        { type: 'range', key: 'gap', label: '图片间距', min: 0, max: 120, step: 4, value: 0,
          fmt: function (v) { return v + ' px'; } },
        { type: 'menu', key: 'bg', label: '底色', value: 'none',
          options: [['none', '透明'], ['white', '白色'], ['black', '黑色']] },
        { type: 'seg', key: 'format', label: '输出格式', value: 'image/png', options: FMT_SEG }
      ],
      run: function (ctx) {
        var o = ctx.opts, f = o.format;
        var gap = Math.max(0, parseInt(o.gap, 10) || 0);
        var bg = o.bg === 'white' ? '#ffffff' : (o.bg === 'black' ? '#000000' : null);
        if (f === 'image/jpeg' && !bg) bg = '#ffffff';

        return ctx.all(function (files) {
          if (files.length < 2) throw new Error('至少选择 2 张图片才能拼接');
          return Promise.all(files.map(fileToImage)).then(function (imgs) {
            var W = 0, H = 0, i, im;
            if (o.dir === 'h') {
              for (i = 0; i < imgs.length; i++) {
                W += imgs[i].naturalWidth;
                H = Math.max(H, imgs[i].naturalHeight);
              }
              W += gap * (imgs.length - 1);
            } else {
              for (i = 0; i < imgs.length; i++) {
                H += imgs[i].naturalHeight;
                W = Math.max(W, imgs[i].naturalWidth);
              }
              H += gap * (imgs.length - 1);
            }
            var c = newCanvas(W, H);
            var cx = ctx2d(c);
            if (bg) { cx.fillStyle = bg; cx.fillRect(0, 0, W, H); }
            var x = 0, y = 0;
            for (i = 0; i < imgs.length; i++) {
              im = imgs[i];
              var iw = im.naturalWidth, ih = im.naturalHeight;
              if (o.dir === 'h') {
                cx.drawImage(im, x, (H - ih) / 2, iw, ih);
                x += iw + gap;
              } else {
                cx.drawImage(im, (W - iw) / 2, y, iw, ih);
                y += ih + gap;
              }
            }
            return toBlob(c, f, 0.92).then(function (blob) {
              if (!blob) throw new Error('拼接失败');
              var total = files.reduce(function (a, x2) { return a + x2.size; }, 0);
              return {
                blob: blob,
                before: total,
                name: 'stitch-' + files.length + '-' + W + 'x' + H + '.' + (MIME_EXT[blob.type] || 'png')
              };
            });
          });
        });
      }
    },

    /* ---------------------------------------------------------- 12 imgpdf */
    /* The mirror of tool 03: that one rasterises a PDF, this one writes one.
       No library — a PDF is a small text grammar and the only thing that has
       to be got right is the xref table, whose entries are byte offsets into
       the finished file. So the file is assembled as a byte array with a
       running cursor, never as a string: the JPEG payloads are binary and a
       string would hand them to the encoder as text.

       Images go in as DCTDecode (raw JPEG) XObjects, which is the one image
       filter every reader has and the one canvas already produces. */
    imgpdf: {
      id: 'imgpdf', theme: '12', index: '12',
      title: '图片转 PDF',
      desc: '把队列里的图片按顺序装进一个 PDF，一图一页，页面尺寸可选 A4 或贴合原图。不经过任何服务器。',
      accept: 'image/*',
      acceptAttr: IMG_ACCEPT,
      dropTitle: '拖入图片',
      dropSub: '按列表顺序成页 · 至少 1 张',
      runLabel: '生成 PDF',
      fields: [
        { type: 'menu', key: 'page', label: '页面尺寸', value: 'a4p',
          options: [['a4p', 'A4 纵向'], ['a4h', 'A4 横向'], ['fit', '贴合原图']],
          note: '「贴合原图」按 72dpi 走，图片多大页面就多大' },
        { type: 'range', key: 'margin', label: '页边距', min: 0, max: 60, step: 2, value: 24,
          fmt: function (v) { return v + ' pt'; },
          offWhen: { key: 'page', values: ['fit'] } },
        { type: 'range', key: 'quality', label: '内嵌质量', min: 50, max: 100, step: 5, value: 90,
          fmt: function (v) { return v + '%'; } }
      ],
      run: function (ctx) {
        var o = ctx.opts;
        var margin = Math.max(0, parseInt(o.margin, 10) || 0);
        var q = (parseInt(o.quality, 10) || 90) / 100;

        return ctx.all(function (files) {
          return Promise.all(files.map(function (file) {
            return fileToImage(file).then(function (img) {
              return toBlob(renderTo(img, img.naturalWidth, img.naturalHeight, '#ffffff'), 'image/jpeg', q)
                .then(function (jb) { return jb.arrayBuffer().then(function (b) { return new Uint8Array(b); }); })
                .then(function (bytes) {
                  return { w: img.naturalWidth, h: img.naturalHeight, jpg: bytes };
                });
            });
          })).then(function (pages) {
            var blob = buildPdf(pages, o.page, margin);
            var total = files.reduce(function (a, f) { return a + f.size; }, 0);
            return {
              blob: blob,
              before: total,
              name: sanitize(stem(files[0].name)) + '-' + pages.length + 'p.pdf'
            };
          });
        });
      }
    },

    /* -------------------------------------------------------- 13 watermark */
    watermark: {
      id: 'watermark', theme: '13', index: '13',
      title: '文字水印',
      desc: '在图上压一行字：位置、字号、透明度可调，也可以整张平铺。字样直接画进像素，不是叠在图片上的图层。',
      accept: 'image/*',
      acceptAttr: IMG_ACCEPT,
      dropTitle: '拖入图片',
      dropSub: IMG_HINT,
      runLabel: '开始加水印',
      fields: [
        { type: 'text', key: 'text', label: '水印文字', value: 'MCLARY',
          placeholder: '想压什么字就打什么字' },
        { type: 'range', key: 'size', label: '字号', min: 2, max: 40, step: 1, value: 9,
          fmt: function (v) { return '图宽的 ' + v + '%'; } },
        { type: 'range', key: 'alpha', label: '透明度', min: 5, max: 100, step: 5, value: 40,
          fmt: function (v) { return v + '%'; } },
        { type: 'menu', key: 'pos', label: '位置', value: 'br',
          options: [['tl', '左上'], ['tr', '右上'], ['c', '居中'], ['bl', '左下'], ['br', '右下']],
          offWhen: { key: 'tile', values: [true] } },
        { type: 'switch', key: 'tile', label: '整张平铺', value: false,
          note: '平铺时斜着排满整张，位置选项不再起作用' },
        { type: 'menu', key: 'ink', label: '字色', value: 'white',
          options: [['white', '白色'], ['black', '黑色']] },
        { type: 'seg', key: 'format', label: '输出格式', value: 'image/jpeg', options: FMT_SEG }
      ],
      run: function (ctx) {
        var o = ctx.opts;
        var f = o.format;
        var size = (parseInt(o.size, 10) || 9) / 100;
        var alpha = (parseInt(o.alpha, 10) || 40) / 100;
        var ink = o.ink === 'black' ? '#000000' : '#ffffff';
        var text = String(o.text == null ? '' : o.text).trim();
        if (!text) throw new Error('水印文字是空的');

        return fontsReady().then(function () {
          return ctx.each(function (file) {
            return fileToImage(file).then(function (img) {
              var W = img.naturalWidth, H = img.naturalHeight;
              var c = newCanvas(W, H);
              var cx = ctx2d(c);
              if (f === 'image/jpeg') { cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, W, H); }
              cx.drawImage(img, 0, 0, W, H);

              var fs = Math.max(8, Math.round(W * size));
              cx.font = '500 ' + fs + 'px ' + CJK_STACK;
              cx.textBaseline = 'alphabetic';
              cx.fillStyle = ink;
              cx.globalAlpha = alpha;
              /* a hairline of the opposite ink keeps the mark readable when it
                 lands on a background of its own colour */
              cx.shadowColor = o.ink === 'black' ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.55)';
              cx.shadowBlur = Math.max(1, fs * 0.06);
              cx.shadowOffsetY = Math.max(1, fs * 0.02);

              if (o.tile) {
                var stepX = cx.measureText(text).width + fs * 1.6;
                var stepY = fs * 2.4;
                cx.save();
                cx.translate(W / 2, H / 2);
                cx.rotate(-30 * Math.PI / 180);
                cx.textAlign = 'center';
                var R = Math.ceil(Math.sqrt(W * W + H * H));
                for (var y = -R; y <= R; y += stepY) {
                  for (var x = -R; x <= R; x += stepX) cx.fillText(text, x, y);
                }
                cx.restore();
              } else {
                var m = cx.measureText(text);
                var tw = m.width, pad = Math.max(6, fs * 0.28);
                var ax = o.pos === 'tl' || o.pos === 'bl' ? pad : (o.pos === 'tr' || o.pos === 'br' ? W - tw - pad : (W - tw) / 2);
                var ay = o.pos === 'tl' || o.pos === 'tr' ? pad + fs * 0.82
                       : (o.pos === 'bl' || o.pos === 'br' ? H - pad : (H + fs * 0.34) / 2);
                cx.textAlign = 'left';
                cx.fillText(text, ax, ay);
              }
              cx.globalAlpha = 1;
              cx.shadowColor = 'transparent';
              cx.shadowBlur = 0;
              cx.shadowOffsetY = 0;
              return toBlob(c, f, 0.92);
            }).then(function (blob) {
              if (!blob) throw new Error('处理失败：' + file.name);
              return { blob: blob, before: file.size, name: stem(file.name) + '-wm.' + (MIME_EXT[blob.type] || 'png') };
            });
          });
        });
      }
    },

    /* ----------------------------------------------------------- 14 border */
    border: {
      id: 'border', theme: '14', index: '14',
      title: '添加边框',
      desc: '在图外面留一圈白边或彩边，或者沿着图的内沿描一道。发图前统一一下边距用得上。',
      accept: 'image/*',
      acceptAttr: IMG_ACCEPT,
      dropTitle: '拖入图片',
      dropSub: IMG_HINT,
      runLabel: '开始加边',
      fields: [
        { type: 'range', key: 'w', label: '边框宽度', min: 0, max: 200, step: 2, value: 24,
          fmt: function (v) { return v + ' px'; } },
        { type: 'switch', key: 'inner', label: '沿内沿描边', value: false,
          note: '描在图片内侧，成品尺寸不变；关闭时是往外留白，图片会变大' },
        { type: 'menu', key: 'ink', label: '边框颜色', value: 'white',
          options: [['white', '白色'], ['black', '黑色'], ['grey', '浅灰'], ['ink', '墨黑']] },
        { type: 'seg', key: 'format', label: '输出格式', value: 'image/jpeg', options: FMT_SEG }
      ],
      run: function (ctx) {
        var o = ctx.opts;
        var f = o.format;
        var bw = Math.max(0, parseInt(o.w, 10) || 0);
        var ink = { white: '#ffffff', black: '#000000', grey: '#e4e4e0', ink: '#16161a' }[o.ink] || '#ffffff';

        return ctx.each(function (file) {
          return fileToImage(file).then(function (img) {
            var iw = img.naturalWidth, ih = img.naturalHeight;
            var W = o.inner ? iw : iw + bw * 2;
            var H = o.inner ? ih : ih + bw * 2;
            var c = newCanvas(W, H);
            var cx = ctx2d(c);
            if (f === 'image/jpeg') { cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, W, H); }
            cx.drawImage(img, o.inner ? 0 : bw, o.inner ? 0 : bw, iw, ih);
            if (o.inner && bw > 0) {
              cx.strokeStyle = ink;
              cx.lineWidth = bw * 2;               /* half of it falls outside */
              cx.strokeRect(0, 0, W, H);
            }
            return toBlob(c, f, 0.92);
          }).then(function (blob) {
            if (!blob) throw new Error('加边失败：' + file.name);
            return { blob: blob, before: file.size, name: stem(file.name) + '-edge.' + (MIME_EXT[blob.type] || 'png') };
          });
        });
      }
    }
  };

  /* the site itself lives in the same registry so one selector drives it too */
  TOOLS.home = HOME;

  var ORDER = ['home', 'compress', 'format', 'pdf', 'resize', 'base64',
               'crop', 'rotate', 'adjust', 'round', 'blur', 'stitch',
               'imgpdf', 'watermark', 'border'];
  var DEFAULT_ID = 'home';
  /* the "07 / 15" counter reads off the list instead of a literal, so adding
     a tool cannot leave the page claiming a number that no longer exists */
  var TOOL_COUNT = ORDER.length - 1;

  /* ================================================================== engine */
  var stage, titleEl, indexEl, descEl;
  var current = null;
  var state = {};
  var onPick = null;

  function st(id) {
    if (!state[id]) state[id] = { files: [], results: [], urls: [], opts: {} };
    return state[id];
  }

  function releaseUrls(s) {
    (s.urls || []).forEach(function (u) { try { URL.revokeObjectURL(u); } catch (e) {} });
    s.urls = [];
  }

  /* resolve lazily so activate() is safe before or without init() */
  function resolveNodes() {
    if (!stage) stage = $('[data-tool-stage]');
    if (!titleEl) titleEl = $('[data-tool-title]');
    if (!indexEl) indexEl = $('[data-tool-index]');
    if (!descEl) descEl = $('[data-tool-desc]');
  }

  /* ---------------------------------------------------------- field markup */
  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }

  /* offWhen takes one condition or a list of them — a field can be ruled out by
     more than one state at once (the quality slider is out both when the mode
     hands quality over to the target size, and when the format is lossless). */
  function offList(f) {
    if (!f.offWhen) return [];
    return Array.isArray(f.offWhen) ? f.offWhen : [f.offWhen];
  }

  function fieldEnabled(f, s) {
    var off = offList(f);
    for (var i = 0; i < off.length; i++) {
      if (off[i].values.indexOf(s.opts[off[i].key]) > -1) return false;
    }
    if (f.onWhen) {
      if (f.onWhen.values.indexOf(s.opts[f.onWhen.key]) < 0) return false;
    }
    return true;
  }

  function buildField(f, s) {
    var wrap = el('div', 't-opt');
    var head = el('div', 't-opt-head');
    var valSpan = el('span', 'micro t-opt-val');

    /* a switch carries its own inline label, so it needs no head */
    if (f.type !== 'switch' && f.type !== 'text') {
      head.appendChild(el('span', 'micro', f.label));
      head.appendChild(valSpan);
      wrap.appendChild(head);
    }

    var showVal = function (v) {
      valSpan.textContent = f.fmt ? f.fmt(Number(v)) : v;
    };
    var setVal = function (v) {
      s.opts[f.key] = v;
      showVal(v);
      syncOpts();
    };

    if (f.type === 'seg') {
      var seg = el('div', 't-seg');
      seg.setAttribute('role', 'radiogroup');
      seg.setAttribute('aria-label', f.label);
      f.options.forEach(function (o) {
        var b = el('button', null, o[1]);
        b.type = 'button';
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', String(s.opts[f.key] === o[0]));
        b.addEventListener('click', function () {
          s.opts[f.key] = o[0];
          $$('button', seg).forEach(function (x) { x.setAttribute('aria-checked', String(x === b)); });
          valSpan.textContent = '';
          syncOpts();
          if (s.panel) {
            syncRunLabel(TOOLS[current], s);
            if (s.stats) s.stats.textContent = '';
            paintBase64Panel(TOOLS[current], s);
          }
        });
        seg.appendChild(b);
      });
      wrap.appendChild(seg);
      valSpan.textContent = '';

    } else if (f.type === 'menu') {
      var menu = el('div', 't-menu');
      var btn = el('button', 't-menu-btn');
      btn.type = 'button';
      var btnLabel = el('span');
      btn.appendChild(btnLabel);
      var caret = el('span', 't-menu-caret', '▾');
      btn.appendChild(caret);
      var list = el('div', 't-menu-list');
      list.setAttribute('role', 'listbox');
      f.options.forEach(function (o) {
        var b = el('button', null, o[1]);
        b.type = 'button';
        b.setAttribute('role', 'option');
        b.setAttribute('aria-selected', String(s.opts[f.key] === o[0]));
        b.addEventListener('click', function () {
          s.opts[f.key] = o[0];
          btnLabel.textContent = o[1];
          $$('button', list).forEach(function (x) { x.setAttribute('aria-selected', String(x === b)); });
          menu.classList.remove('is-open');
          valSpan.textContent = '';
          syncOpts();
        });
        list.appendChild(b);
      });
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        var wasOpen = menu.classList.contains('is-open');
        $$('.t-menu.is-open').forEach(function (m) { m.classList.remove('is-open'); });
        menu.classList.toggle('is-open', !wasOpen);
      });
      menu.appendChild(btn); menu.appendChild(list);
      wrap.appendChild(menu);
      f.options.forEach(function (o) { if (o[0] === s.opts[f.key]) btnLabel.textContent = o[1]; });

    } else if (f.type === 'range') {
      var row = el('div', 't-range-row');
      var r = el('input', 't-range');
      r.type = 'range';
      r.min = f.min; r.max = f.max; r.step = f.step;
      r.setAttribute('aria-label', f.label);
      r.value = s.opts[f.key];
      r.addEventListener('input', function () { setVal(r.value); });
      row.appendChild(r);
      wrap.appendChild(row);
      showVal(r.value);

    } else if (f.type === 'switch') {
      var lab = el('label', 't-switch');
      var cb = el('input');
      cb.type = 'checkbox';
      cb.checked = !!s.opts[f.key];
      cb.addEventListener('change', function () { s.opts[f.key] = cb.checked; syncOpts(); });
      var track = el('span', 't-switch-track');
      track.appendChild(el('span', 't-switch-thumb'));
      var txt = el('span', null, f.label);
      lab.appendChild(cb); lab.appendChild(txt); lab.appendChild(track);
      wrap.appendChild(lab);
      valSpan.remove();

    } else if (f.type === 'number') {
      var n = el('input', 't-input num');
      n.type = 'number';
      n.min = f.min; n.max = f.max;
      n.setAttribute('aria-label', f.label + (f.unit ? '（' + f.unit + '）' : ''));
      n.value = s.opts[f.key];
      n.addEventListener('input', function () { s.opts[f.key] = n.value; });
      wrap.appendChild(n);
      if (f.unit) { valSpan.textContent = f.unit; }

    } else {  // text
      var t = el('input', 't-input');
      t.type = 'text';
      t.placeholder = f.placeholder || '';
      t.setAttribute('aria-label', f.label);
      t.value = s.opts[f.key] == null ? '' : s.opts[f.key];
      t.addEventListener('input', function () { s.opts[f.key] = t.value; });
      wrap.appendChild(t);
      valSpan.remove();
    }

    /* `offNote` only makes sense while the control is actually greyed out.
       It may be a function of the state: a field can be ruled out by more than
       one condition, and then one fixed sentence can only be right for one of
       them — it has to say which one actually fired. */
    if (f.note) {
      wrap.appendChild(el('div', 'micro t-note', f.note));
    } else if (f.offNote) {
      wrap.appendChild(el('div', 'micro t-note t-offnote',
        typeof f.offNote === 'function' ? f.offNote(s) : f.offNote));
    }
    return wrap;
  }

  /* grey out controls that do not apply to the current mode */
  function syncOpts() {
    if (!stage) return;
    var tool = TOOLS[current];
    if (!tool) return;
    var s = st(tool.id);
    var opts = stage.querySelector('.t-opts');
    if (!opts) return;
    tool.fields.forEach(function (f) {
      var w = opts.querySelector('[data-key="' + f.key + '"]');
      if (!w) return;
      w.classList.toggle('is-off', !fieldEnabled(f, s));
      /* a state-dependent offNote has to be re-read on every state change —
         it is the sentence that says WHY the control went grey, and with more
         than one condition behind it, yesterday's reason is today's lie */
      if (typeof f.offNote === 'function') {
        var note = w.querySelector('.t-offnote');
        if (note) note.textContent = f.offNote(s);
      }
    });
  }

  /* ------------------------------------------------------------ stage body */
  function buildHome(tool) {
    var box = el('div', 'home');
    /* lines can be empty — the hero above already carries the big type */
    if (tool.lines && tool.lines.length) {
      var lead = el('div', 'home-lead');
      tool.lines.forEach(function (t) { lead.appendChild(el('h1', 'h1', t)); });
      box.appendChild(lead);
    }

    var body = el('div', 'home-body');
    tool.body.forEach(function (t) { body.appendChild(el('p', 'p1', t)); });
    var pr = el('div', 'home-promise');
    tool.promise.forEach(function (t) { pr.appendChild(el('span', null, t)); });
    body.appendChild(pr);
    box.appendChild(body);

    stage.appendChild(box);
  }

  function buildStage(tool) {
    if (tool.kind === 'home') { buildHome(tool); return; }

    var s = st(tool.id);
    var grid = el('div', 'tool');

    /* left column — drop zone */
    var colL = el('div', 'tool-col-l');
    var drop = el('div', 't-drop');
    var input = el('input');
    input.type = 'file';
    input.multiple = true;
    input.setAttribute('aria-label', tool.dropTitle + '：点击选择文件');
    if (tool.acceptAttr) input.accept = tool.acceptAttr;
    drop.appendChild(input);
    var dIn = el('div');
    dIn.appendChild(el('span', 't-drop-main', tool.dropTitle));
    dIn.appendChild(el('span', 'micro t-drop-sub', tool.dropSub));
    drop.appendChild(dIn);

    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('is-over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('is-over'); });
    });
    drop.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files) addFiles(tool, s, e.dataTransfer.files);
    });
    input.addEventListener('change', function () {
      addFiles(tool, s, input.files);
      input.value = '';
    });
    colL.appendChild(drop);
    /* The queue lives under the drop zone, not under the action bar: the files
       you just picked are the answer to "拖入图片", so they belong next to the
       thing that asked for them. Under the bar they read as output, sitting
       between the button you are about to press and the results it produces. */
    colL.appendChild(el('div', 't-queue'));
    grid.appendChild(colL);

    /* right column — options */
    var colR = el('div', 'tool-col-r');
    var opts = el('div', 't-opts');
    tool.fields.forEach(function (f) {
      var w = buildField(f, s);
      w.setAttribute('data-key', f.key);
      opts.appendChild(w);
    });
    colR.appendChild(opts);
    grid.appendChild(colR);

    /* action bar */
    var bar = el('div', 't-bar');
    var run = el('button', 't-btn', tool.runLabel);
    run.type = 'button';
    run.addEventListener('click', function () {
      if (tool.custom && s.opts.mode === 'decode') decodeBase64(tool, s);
      else if (tool.custom) encodeNow(tool, s);
      else doRun(tool, s);
    });
    var clr = el('button', 't-btn t-btn-ghost', '清空');
    clr.type = 'button';
    clr.addEventListener('click', function () {
      s.files = []; s.results = []; s.dataUrl = null; s.decoded = null; s.b64Input = '';
      releaseUrls(s);
      paintQueue(tool, s);
      paintResults(s);
      if (s.stats) s.stats.textContent = '';
      if (s.panel) paintBase64Panel(tool, s);
    });
    var stats = el('span', 'micro t-stats');
    s.stats = stats;
    s.runBtn = run;
    bar.appendChild(run); bar.appendChild(clr); bar.appendChild(stats);
    grid.appendChild(bar);

    if (tool.custom) {
      s.panel = el('div', 't-panel');
      grid.appendChild(s.panel);
    } else {
      grid.appendChild(el('div', 't-results'));
    }

    stage.appendChild(grid);
    syncRunLabel(tool, s);
    syncOpts();
    paintQueue(tool, s);
    paintResults(s);
    if (tool.custom) paintBase64Panel(tool, s);
  }

  /* base64's primary action flips with the mode */
  function syncRunLabel(tool, s) {
    if (!s.runBtn || !tool || !tool.custom) return;
    s.runBtn.textContent = (s.opts.mode === 'decode') ? '解码为文件' : tool.runLabel;
  }

  /* -------------------------------------------------------------- base64 */
  function paintBase64Panel(tool, s) {
    var p = s.panel;
    if (!p) return;
    p.innerHTML = '';

    if (s.opts.mode === 'encode') {
      if (!s.files.length) {
        p.appendChild(el('p', 'p1 t-empty', '先选一个文件，然后点左下角的「' + tool.runLabel + '」。'));
        return;
      }
      if (s.dataUrl) {
        var ta = el('textarea', 't-area');
        ta.readOnly = true;
        ta.setAttribute('aria-label', 'Base64 编码结果');
        ta.value = s.dataUrl;
        p.appendChild(ta);

        var info = el('div', 'micro t-stats');
        info.style.textAlign = 'left';
        var grow = s.dataUrl.length / Math.max(1, s.files[0].size) - 1;
        info.textContent = s.files[0].name + ' · ' + fmtBytes(s.files[0].size) + ' → ' +
                           fmtBytes(s.dataUrl.length) + ' 文本 · 膨胀 ' + (grow * 100).toFixed(0) + '%';
        p.appendChild(info);

        var row = el('div', 't-bar');
        row.style.borderTop = 'none';
        row.style.paddingTop = '0';
        var copy = el('button', 't-btn t-btn-ghost', '复制到剪贴板');
        copy.type = 'button';
        copy.addEventListener('click', function () {
          ta.select();
          try {
            if (navigator.clipboard) navigator.clipboard.writeText(s.dataUrl);
            else document.execCommand('copy');
            copy.textContent = '已复制';
          } catch (e) { copy.textContent = '请手动复制'; }
          setTimeout(function () { copy.textContent = '复制到剪贴板'; }, 1400);
        });
        var dl = el('a', 't-btn t-btn-ghost', '下载 .txt');
        dl.download = sanitize(stem(s.files[0].name)) + '.base64.txt';
        dl.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(s.dataUrl);
        row.appendChild(copy); row.appendChild(dl);
        p.appendChild(row);
      }
      return;
    }

    /* decode mode */
    var ta2 = el('textarea', 't-area');
    ta2.placeholder = '粘贴 Base64 文本，支持 data:image/png;base64,… 或纯 Base64 内容';
    ta2.setAttribute('aria-label', '待解码的 Base64 文本');
    if (s.b64Input) ta2.value = s.b64Input;
    ta2.addEventListener('input', function () { s.b64Input = ta2.value; });
    p.appendChild(ta2);

    if (s.decodeError) p.appendChild(el('p', 'p1 t-note', s.decodeError));
    if (s.decoded) {
      var holder = el('div', 't-results');
      holder.style.gridColumn = 'auto';
      holder.appendChild(outCard(s.decoded, null, null, 'is-txt'));
      p.appendChild(holder);
    }
  }

  function encodeNow(tool, s) {
    if (!s.files.length) { flash('先添加至少一个文件'); return; }
    var btn = s.runBtn;
    if (btn) btn.disabled = true;
    if (s.stats) s.stats.textContent = '编码中…';
    blobToDataUrl(s.files[0]).then(function (url) {
      s.dataUrl = url;
      if (btn) btn.disabled = false;
      paintBase64Panel(tool, s);
    }).catch(function (e) {
      if (btn) btn.disabled = false;
      flash('出错了：' + e.message);
    });
  }

  function decodeBase64(tool, s) {
    var raw = String(s.b64Input || '').trim();
    if (!raw) { s.decoded = null; s.decodeError = null; paintBase64Panel(tool, s); return; }
    var m = raw.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
    var mime = 'application/octet-stream';
    var payload = raw;
    if (m) {
      mime = m[1] || mime;
      payload = m[3];
      if (!m[2]) payload = decodeURIComponent(payload);
    }
    var bin;
    try { bin = atob(payload.replace(/\s+/g, '')); }
    catch (e) {
      s.decoded = null;
      s.decodeError = '这段文本不是有效的 Base64';
      paintBase64Panel(tool, s);
      return;
    }
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    var blob = new Blob([arr], { type: mime });
    var ext = (mime.split('/')[1] || 'bin').replace(/\+xml$/, '');
    releaseUrls(s);
    s.urls.push(URL.createObjectURL(blob));
    s.decoded = { blob: blob, name: 'decoded.' + ext, size: blob.size, url: s.urls[s.urls.length - 1] };
    s.decodeError = null;
    s.stats.textContent = '已解码 · ' + fmtBytes(blob.size);
    paintBase64Panel(tool, s);
  }

  /* ------------------------------------------------------------- queue ui */
  function addFiles(tool, s, list) {
    var arr = Array.prototype.slice.call(list || []);
    if (!arr.length) return;
    arr.forEach(function (f) {
      if (tool.accept && tool.accept !== '*/*') {
        var ok = tool.accept === 'image/*'
          ? /^image\//.test(f.type)
          : (f.type === tool.accept.split(',')[0] || /\.pdf$/i.test(f.name));
        if (!ok) return;
      }
      if (s.files.length >= 40) return;
      s.files.push(f);
    });
    if (s.opts.mode === 'encode') s.dataUrl = null;
    paintQueue(tool, s);
    if (s.panel) paintBase64Panel(tool, s);
  }

  function paintQueue(tool, s) {
    var host = stage && stage.querySelector('.t-queue');
    if (!host) return;
    host.innerHTML = '';
    if (!s.files.length) return;

    s.files.forEach(function (f, i) {
      var chip = el('div', 't-chip');
      chip.appendChild(el('span', 'p1 t-chip-name', f.name));
      chip.appendChild(el('span', 'micro t-chip-size', fmtBytes(f.size)));
      var x = el('button', 't-chip-x', '×');
      x.type = 'button';
      x.setAttribute('aria-label', '移除 ' + f.name);
      x.addEventListener('click', function () {
        s.files.splice(i, 1);
        s.dataUrl = null;
        paintQueue(tool, s);
        if (s.panel) paintBase64Panel(tool, s);
      });
      chip.appendChild(x);
      host.appendChild(chip);
    });
  }

  function outCard(r, beforeSize, thumb, extraClass) {
    var a = el('a', 't-out' + (extraClass ? ' ' + extraClass : ''));
    a.href = r.url || '#';
    a.download = r.name;
    if (r.url) a.setAttribute('data-cursor', '下载');

    var t = el('div', 't-out-thumb');
    if (thumb) {
      var im = el('img');
      im.src = thumb;
      im.alt = '';
      t.appendChild(im);
    }
    var m = el('div', 't-out-meta');
    m.appendChild(el('span', 'p1 t-out-name', r.name));
    var sz = el('span', 'micro t-out-save');
    if (beforeSize && beforeSize > 0 && r.size != null) {
      var delta = (beforeSize - r.size) / beforeSize * 100;
      sz.textContent = (delta >= 0 ? '−' : '+') + Math.abs(delta).toFixed(0) + '%';
    } else if (r.size != null) {
      sz.textContent = fmtBytes(r.size);
    }
    m.appendChild(sz);
    a.appendChild(t); a.appendChild(m);
    return a;
  }

  function paintResults(s) {
    var host = stage && stage.querySelector('.t-results');
    if (!host) return;
    host.innerHTML = '';
    if (!s.results.length) return;
    s.results.forEach(function (r) {
      host.appendChild(outCard(r, r.before, r.thumb));
    });
  }

  /* ------------------------------------------------------------------ run */
  function collect(acc, r) {
    if (!r) return;
    // one file can yield many results (PDF -> one image per page)
    if (Object.prototype.toString.call(r) === '[object Array]') {
      r.forEach(function (x) { if (x && x.blob) acc.push(x); });
    } else if (r.blob) {
      acc.push(r);
    }
  }

  function doRun(tool, s) {
    if (!s.files.length) { flash('先添加至少一个文件'); return; }
    var btn = s.runBtn;
    var results = stage.querySelector('.t-results');

    releaseUrls(s);
    s.results = [];
    if (results) results.innerHTML = '';
    if (btn) btn.disabled = true;
    if (s.stats) s.stats.textContent = '处理中…';

    var acc = [];
    var ctx = {
      opts: s.opts,
      /* per-file: the workhorse */
      each: function (fn) {
        return s.files.reduce(function (chain, file, i) {
          return chain.then(function () {
            if (s.stats) s.stats.textContent = '处理中… ' + (i + 1) + ' / ' + s.files.length;
            return Promise.resolve(fn(file, i)).then(function (r) { collect(acc, r); });
          });
        }, Promise.resolve());
      },
      /* whole-batch: for tools that merge the queue into one output */
      all: function (fn) {
        if (s.stats) s.stats.textContent = '处理中… 共 ' + s.files.length + ' 个文件';
        return Promise.resolve().then(function () { return fn(s.files); })
          .then(function (r) { collect(acc, r); });
      }
    };

    tool.run(ctx).then(function () {
      return acc;
    }).then(function (outs) {
      s.results = outs.map(function (r) {
        var url = URL.createObjectURL(r.blob);
        s.urls.push(url);
        return {
          blob: r.blob,
          name: r.name,
          size: r.blob.size,
          url: url,
          before: r.before,
          thumb: /^image\//.test(r.blob.type) ? url : null
        };
      });
      paintResults(s);
      if (btn) btn.disabled = false;
      if (s.stats) {
        var inBytes = s.files.reduce(function (a, f) { return a + f.size; }, 0);
        var outBytes = s.results.reduce(function (a, r) { return a + r.size; }, 0);
        if (inBytes && outBytes && inBytes !== outBytes) {
          var d = (inBytes - outBytes) / inBytes * 100;
          s.stats.textContent = s.results.length + ' 个文件 · ' + fmtBytes(inBytes) + ' → ' +
            fmtBytes(outBytes) + ' · ' + (d >= 0 ? '节省 ' : '增加 ') + Math.abs(d).toFixed(0) + '%';
        } else {
          s.stats.textContent = s.results.length + ' 个文件已完成';
        }
      }
    }).catch(function (e) {
      if (btn) btn.disabled = false;
      if (s.stats) s.stats.textContent = '出错了：' + (e && e.message ? e.message : e);
    });
  }

  function flash(msg) {
    var node = stage && stage.querySelector('.t-stats');
    if (!node) return;
    node.textContent = msg;
    if (G && !reduce) {
      G.fromTo(node, { opacity: .2, x: -6 },
        { opacity: 1, x: 0, duration: .5, ease: 'elastic.out(1, .4)' });
    }
  }

  /* ----------------------------------------------------------------- swap */
  function renderTitle(tool) {
    if (!titleEl) return;
    titleEl.innerHTML = '';
    titleEl.appendChild(el('h1', 'h1', tool.title));
  }

  function activate(id) {
    var tool = TOOLS[id];
    if (!tool) return;
    resolveNodes();
    var changed = (current !== id);
    current = id;
    var s = st(id);

    tool.fields.forEach(function (f) {
      if (s.opts[f.key] === undefined) s.opts[f.key] = f.value;
    });

    document.body.className = document.body.className
      .replace(/tool-\w+/g, '').trim() + ' tool-' + id;

    if (titleEl) {
      if (changed && G && !reduce) G.to(titleEl, { opacity: 0, y: -14, duration: .2, ease: 'power2.in' });
      var swap = function () {
        renderTitle(tool);
        if (changed && G && !reduce) {
          G.fromTo(titleEl, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: .5, ease: 'power2.out' });
        }
      };
      if (changed && G && !reduce) G.delayedCall(.19, swap);
      else swap();
    }

    if (descEl) descEl.textContent = tool.desc;
    if (indexEl) indexEl.textContent = (tool.index === '00') ? '站点' : (tool.index + ' / ' + TOOL_COUNT);

    if (stage) {
      stage.innerHTML = '';
      buildStage(tool);
      if (G && !reduce) {
        G.fromTo(stage.children, { opacity: 0, y: 18 },
          { opacity: 1, y: 0, duration: .55, stagger: .05, ease: 'power3.out' });
      }
    }

    $$('.index-row').forEach(function (r) {
      r.classList.toggle('is-current', r.dataset.tool === id);
    });
    /* the state swatches live in the floating palette dock now */
    $$('.palette-chip').forEach(function (b) {
      var on = b.dataset.tool === id;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
    });
  }

  /* ------------------------------------------------------------------ init */
  function init(opts) {
    opts = opts || {};
    onPick = opts.onPick || null;
    resolveNodes();

    if (onPick) {
      $$('.index-row').forEach(function (row) {
        row.addEventListener('click', function () {
          onPick(row.dataset.tool, row.dataset.theme);
        });
      });
    }

    document.addEventListener('click', function (e) {
      if (!e.target.closest || !e.target.closest('.t-menu')) {
        $$('.t-menu.is-open').forEach(function (m) { m.classList.remove('is-open'); });
      }
    });

    /* the caller's choice wins: it has already resolved the persisted tool
       against the markup, and the page colour follows that same pick */
    var declared = (document.body.className.match(/tool-(\w+)/) || [])[1];
    var pick = opts.initial || declared;
    activate(TOOLS[pick] ? pick : DEFAULT_ID);
  }

  window.Tools = {
    init: init,
    activate: activate,
    ids: function () { return ORDER.slice(); },
    defs: TOOLS,
    util: { fmtBytes: fmtBytes, parsePages: parsePages },
    get current() { return current; }
  };
})();
