import mammoth from "mammoth/mammoth.browser";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorkerSrc;

const supportedExtensions = [".txt", ".md", ".pdf", ".docx", ".doc"] as const;

export type SupportedDocumentExtension = typeof supportedExtensions[number];

export function getDocumentExtension(fileName: string): string {
  const parts = fileName.toLowerCase().split(".");
  if (parts.length < 2) return "";
  return `.${parts.pop()}`;
}

export function isSupportedDocumentExtension(extension: string): extension is SupportedDocumentExtension {
  return supportedExtensions.includes(extension as SupportedDocumentExtension);
}

function normalizeExtractedText(text: string) {
  return text
    .replace(/\u0000/g, " ")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

async function extractPdfText(arrayBuffer: ArrayBuffer) {
  const pdf = await getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ");
    pages.push(text);
  }

  return normalizeExtractedText(pages.join("\n\n"));
}

async function extractDocxText(arrayBuffer: ArrayBuffer) {
  const result = await mammoth.extractRawText({ arrayBuffer });
  return normalizeExtractedText(result.value);
}

function extractLegacyDocText(arrayBuffer: ArrayBuffer) {
  let decoded = "";
  try {
    decoded = new TextDecoder("windows-1252").decode(new Uint8Array(arrayBuffer));
  } catch {
    decoded = new TextDecoder().decode(new Uint8Array(arrayBuffer));
  }

  const matches = decoded.match(/[A-Za-z0-9][^\x00-\x08\x0B\x0C\x0E-\x1F]{3,}/g) || [];
  const text = normalizeExtractedText(matches.join("\n"));
  return text;
}

export async function extractTextFromDocument(file: File): Promise<{ text: string; warning?: string }> {
  const extension = getDocumentExtension(file.name);

  if (!isSupportedDocumentExtension(extension)) {
    throw new Error("Unsupported file type. Use .txt, .md, .pdf, .doc, or .docx.");
  }

  if (extension === ".txt" || extension === ".md") {
    return { text: normalizeExtractedText(await file.text()) };
  }

  const arrayBuffer = await file.arrayBuffer();

  if (extension === ".pdf") {
    return { text: await extractPdfText(arrayBuffer) };
  }

  if (extension === ".docx") {
    return { text: await extractDocxText(arrayBuffer) };
  }

  const text = extractLegacyDocText(arrayBuffer);
  if (!text) {
    throw new Error("Could not extract text from this .doc file.");
  }

  return {
    text,
    warning: "Legacy .doc extraction may lose some formatting. Please review the imported text.",
  };
}
