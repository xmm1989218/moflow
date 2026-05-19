import type { EditorTheme } from "../stores/appStore";
import { getThemeCSS } from "./themeCSS";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";

const ASSET_HOST_RE = /https?:\/\/asset\.localhost\//gi;

function replaceAssetUrlsWithBase64(html: string): Promise<string> {
  const matches = [...html.matchAll(/src="(https?:\/\/asset\.localhost\/[^"]+)"/gi)];
  if (matches.length === 0) return Promise.resolve(html);

  const replacements = matches.map(async (match) => {
    const assetUrl = match[1];
    const filePath = decodeURIComponent(assetUrl.replace(ASSET_HOST_RE, ""));
    try {
      const data = await readFile(filePath);
      const base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
      const ext = filePath.split(".").pop()?.toLowerCase() ?? "png";
      const mimeMap: Record<string, string> = {
        png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
        gif: "image/gif", svg: "image/svg+xml", webp: "image/webp",
        bmp: "image/bmp", ico: "image/x-icon",
      };
      const mime = mimeMap[ext] ?? "image/png";
      return { assetUrl, dataUrl: `data:${mime};base64,${base64}` };
    } catch {
      return { assetUrl, dataUrl: assetUrl };
    }
  });

  return Promise.all(replacements).then((results) => {
    let result = html;
    for (const { assetUrl, dataUrl } of results) {
      result = result.replaceAll(assetUrl, dataUrl);
    }
    return result;
  });
}

export async function exportAsHtml(bodyHtml: string, themeName: EditorTheme): Promise<string> {
  const css = getThemeCSS(themeName);
  const processedHtml = await replaceAssetUrlsWithBase64(bodyHtml);

  return `<!DOCTYPE html>
<html lang="en" data-editor-theme="${themeName}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MoFlow Export</title>
  <style>
    ${css}
    body {
      max-width: 980px;
      margin: 0 auto;
      padding: 45px 48px;
      background-color: var(--moflow-bg);
      color: var(--moflow-text);
      font-family: var(--moflow-font-body);
      font-size: 16px;
      line-height: 1.7;
    }
    h1 { font-size: 2em; font-weight: 700; border-bottom: 1px solid var(--moflow-border); padding-bottom: 0.3em; margin-top: 24px; margin-bottom: 16px; }
    h2 { font-size: 1.5em; font-weight: 600; border-bottom: 1px solid var(--moflow-border); padding-bottom: 0.3em; margin-top: 20px; margin-bottom: 12px; }
    h3 { font-size: 1.25em; font-weight: 600; margin-top: 16px; margin-bottom: 8px; }
    h4, h5, h6 { font-weight: 600; margin-top: 12px; margin-bottom: 6px; }
    p { margin: 8px 0; }
    code { font-family: var(--moflow-font-mono); font-size: 0.875em; background-color: var(--moflow-code-bg); padding: 0.2em 0.4em; border-radius: 4px; }
    pre { background-color: var(--moflow-code-bg); border-radius: 8px; padding: 16px; overflow-x: auto; margin: 12px 0; }
    pre code { background: none; padding: 0; }
    blockquote { border-left: 4px solid var(--moflow-accent); padding: 0.5em 1em; margin: 8px 0; background-color: var(--moflow-bg-secondary); border-radius: 0 8px 8px 0; }
    ul, ol { padding-left: 1.5em; margin: 8px 0; }
    li { margin: 4px 0; }
    table { border-collapse: collapse; width: 100%; margin: 12px 0; }
    th, td { border: 1px solid var(--moflow-border); padding: 6px 13px; text-align: left; }
    th { background-color: var(--moflow-bg-secondary); font-weight: 600; }
    hr { border: none; background-color: var(--moflow-border); height: 1px; margin: 24px 0; }
    a { color: var(--moflow-accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
    img { max-width: 100%; border-radius: 8px; }
    .moflow-mermaid-preview { display: flex; justify-content: center; padding: 16px; }
    .moflow-mermaid-preview svg { max-width: 100%; height: auto; }
    .moflow-mermaid-error { color: #d32f2f; font-size: 13px; padding: 8px 12px; }
  </style>
</head>
<body>
${processedHtml}
</body>
</html>`;
}

async function waitForImages(el: HTMLElement): Promise<void> {
  const images = el.querySelectorAll("img");
  if (images.length === 0) return;
  await Promise.all(
    Array.from(images).map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }),
    ),
  );
}

export async function exportPdfFrontend(html: string, outputPath: string): Promise<void> {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = "position:fixed;left:-99999px;top:0;width:980px;height:12000px;border:none;visibility:hidden;";
  iframe.srcdoc = html;
  document.body.appendChild(iframe);

  try {
    await new Promise<void>((resolve) => {
      iframe.addEventListener("load", () => resolve(), { once: true });
      if (iframe.contentDocument?.readyState === "complete") resolve();
    });

    const iframeDoc = iframe.contentDocument!;
    await iframeDoc.fonts.ready;
    await waitForImages(iframeDoc.body);

    const canvas = await html2canvas(iframeDoc.body, {
      width: 980,
      windowWidth: 980,
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });

    const imgWidth = 210;
    const pageHeight = 297;
    const marginX = 6.35;
    const marginY = 12.7;
    const contentWidth = imgWidth - marginX * 2;
    const contentHeight = pageHeight - marginY * 2;
    const imgHeight = (canvas.height * contentWidth) / canvas.width;
    const pxPerMm = canvas.width / contentWidth;
    const totalPages = Math.ceil(imgHeight / contentHeight);

    const pdf = new jsPDF("p", "mm", "a4");

    for (let page = 0; page < totalPages; page++) {
      if (page > 0) pdf.addPage();

      const pageTopMm = page * contentHeight;
      const pageBottomMm = pageTopMm + contentHeight;
      const sliceTopPx = Math.floor(pageTopMm * pxPerMm);
      const sliceBottomPx = Math.min(Math.ceil(pageBottomMm * pxPerMm), canvas.height);
      const sliceHeightPx = sliceBottomPx - sliceTopPx;
      const sliceHeightMm = sliceHeightPx / pxPerMm;

      if (sliceHeightPx <= 0) continue;

      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeightPx;
      const ctx = pageCanvas.getContext("2d")!;
      ctx.drawImage(canvas, 0, sliceTopPx, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx);

      pdf.addImage(
        pageCanvas.toDataURL("image/jpeg", 0.95),
        "JPEG",
        marginX,
        marginY,
        contentWidth,
        sliceHeightMm,
      );
    }

    const pdfBytes = new Uint8Array(pdf.output("arraybuffer") as ArrayBuffer);
    await writeFile(outputPath, pdfBytes);
  } finally {
    document.body.removeChild(iframe);
  }
}
