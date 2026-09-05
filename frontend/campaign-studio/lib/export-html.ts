export function absolutizeEmailHtml(html: string, origin: string) {
  const base = origin.replace(/\/$/, "");
  return html
    .replace(/\b(src|href|background)=(['"])(\/(?!\/)[^'"]+)\2/gi, (_match, attribute, quote, path) =>
      `${attribute}=${quote}${base}${path}${quote}`,
    )
    .replace(/url\(\s*(['"]?)(\/(?!\/)[^)'"\s]+)\1\s*\)/gi, (_match, quote, path) =>
      `url(${quote}${base}${path}${quote})`,
    );
}
