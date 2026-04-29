export function buildKaTeXHtml(params: {
  title?: string;
  content: string;
  textColor?: string;
  backgroundColor?: string;
}): string {
  const title = params.title ?? 'Math';
  const textColor = params.textColor ?? '#0F172A';
  const bg = params.backgroundColor ?? 'transparent';

  // Notes:
  // - We render both inline \( \) and block \[ \] via auto-render.
  // - We keep it self-contained, no external fonts required.
  const escaped = params.content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
    <title>${title}</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css">
    <style>
      body {
        margin: 0;
        padding: 0;
        background: ${bg};
        color: ${textColor};
        font-family: -apple-system, system-ui, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji";
      }
      .wrap {
        padding: 0px;
        font-size: 16px;
        line-height: 1.55;
        word-break: break-word;
      }
      .katex-display { overflow-x: auto; overflow-y: hidden; padding: 4px 0; }
      pre, code { white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <div class="wrap" id="root">${escaped}</div>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js"></script>
    <script>
      window.addEventListener('DOMContentLoaded', function () {
        if (!window.renderMathInElement) return;
        window.renderMathInElement(document.getElementById('root'), {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "\\\\[", right: "\\\\]", display: true },
            { left: "$", right: "$", display: false },
            { left: "\\\\(", right: "\\\\)", display: false }
          ],
          throwOnError: false
        });
      });
    </script>
  </body>
</html>`;
}

