import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import nunjucks from 'nunjucks';
import puppeteer from 'puppeteer';
import type { Report } from '@workflow-archaeologist/core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_PATH = path.join(__dirname, 'templates');

export async function generatePdf(
  report: Report,
  outputPath: string
): Promise<void> {
  nunjucks.configure(TEMPLATE_PATH, { autoescape: true });
  const html = nunjucks.render('report.html', report);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await page.pdf({
      path: outputPath,
      format: 'A4',
      margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
      printBackground: true,
    });
  } finally {
    await browser.close();
  }
}