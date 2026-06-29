// Уніфікований об'єкт операції на виході з будь-якого парсера:
// { date, counterparty, amount, description }
// Точність розпізнавання тексту з фото/сканів — це задача OCR-рушія
// (тут Tesseract.js, локально, без зовнішніх API і витрат). Якщо колись
// знадобиться вища точність на складних таблицях — той самий контракт
// (масив { date, counterparty, amount, description }) можна підключити
// до хмарного Document AI чи іншого API, замінивши лише runOCR нижче.
//
// Бібліотеки (ExcelJS, mammoth, Tesseract, pdfjs) підвантажуються лише в
// момент реального використання — динамічним import(). Це тримає основний
// бандл легким і не змушує завантажувати ~5 МБ OCR-рушія тому, хто жодного
// разу не завантажував фото рахунку.

export const parseFile = async (file) => {
  const extension = file.name.split('.').pop().toLowerCase();

  if (extension === 'xlsx' || extension === 'xls') return await parseExcel(file);
  if (extension === 'docx')                        return await parseWord(file);
  if (extension === 'pdf')                          return await parsePdf(file);
  if (['jpg', 'jpeg', 'png', 'webp'].includes(extension)) return await parseImage(file);

  throw new Error(`Непідтримуваний формат: .${extension}`);
};

// ─── Excel ────────────────────────────────────────────────────────────
const parseExcel = async (file) => {
  const { default: ExcelJS } = await import('exceljs');
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);

  const worksheet = workbook.worksheets[0];
  const rows = [];

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // пропускаємо заголовок
    const values = row.values.slice(1);
    const amount = parseFloat(values[2]) || 0;
    if (!values[0] && !values[1] && !amount) return; // порожній рядок
    rows.push({
      date:         values[0] instanceof Date
                      ? values[0].toISOString().split('T')[0]
                      : normalizeDate(String(values[0] ?? '')),
      counterparty: String(values[1] ?? ''),
      amount,
      description:  String(values[3] ?? '')
    });
  });

  return rows;
};

// ─── Word (.docx) ─────────────────────────────────────────────────────
// Документи такого типу (рахунок/акт у Word) рідко мають жорстку табличну
// структуру, тому витягуємо повний текст і шукаємо в ньому суму, дату й
// контрагента евристикою. Менш точно за Excel, але саме тому є екран
// перевірки (ReviewOperation) перед збереженням.
const parseWord = async (file) => {
  const mammothModule = await import('mammoth');
  const mammoth = mammothModule.default || mammothModule;
  const buffer = await file.arrayBuffer();
  const { value: text } = await mammoth.extractRawText({ arrayBuffer: buffer });
  return extractOperationsFromText(text, file.name);
};

// ─── PDF ──────────────────────────────────────────────────────────────
// Працює надійно для "цифрових" PDF (є текстовий шар — рахунки з 1С,
// експорт з банку тощо). Скановані PDF без текстового шару тексту не
// містять — у такому разі краще завантажити файл як фото (наступний кейс),
// це піде через OCR.
const parsePdf = async (file) => {
  const pdfjsLib = await import('pdfjs-dist');
  const { default: pdfjsWorker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    fullText += content.items.map(it => it.str).join(' ') + '\n';
  }

  if (!fullText.trim()) {
    throw new Error('У цьому PDF немає текстового шару (схоже, це скан). Завантажте файл як фото — він пройде через розпізнавання зображення.');
  }

  return extractOperationsFromText(fullText, file.name);
};

// ─── Фото / скан (OCR) ──────────────────────────────────────────────
const parseImage = async (file) => {
  const { default: Tesseract } = await import('tesseract.js');
  const { data: { text } } = await Tesseract.recognize(file, 'ukr+eng');
  if (!text.trim()) throw new Error('Не вдалося розпізнати текст на зображенні');
  return extractOperationsFromText(text, file.name);
};

// ─── Спільна евристика витягування операції з вільного тексту ─────────
const AMOUNT_RE = /(\d[\d\s]{0,9}[.,]\d{2})\s*(?:грн|uah|₴)?/i;
const DATE_RE   = /(\d{2})[.\-/](\d{2})[.\-/](\d{4})/;

const extractOperationsFromText = (text, fallbackName) => {
  const amounts = [...text.matchAll(new RegExp(AMOUNT_RE, 'gi'))]
    .map(m => parseFloat(m[1].replace(/\s/g, '').replace(',', '.')))
    .filter(n => !isNaN(n));
  const amount = amounts.length ? Math.max(...amounts) : 0; // зазвичай "разом" — найбільша сума в документі

  const dateMatch = text.match(DATE_RE);
  const date = dateMatch ? `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}` : new Date().toISOString().slice(0, 10);

  // Контрагента з вільного тексту надійно витягнути неможливо без шаблону —
  // підставляємо назву файлу як підказку, користувач підправить на екрані перевірки.
  const counterparty = fallbackName.replace(/\.[^.]+$/, '');

  if (amount === 0) {
    throw new Error('Не вдалося знайти суму в документі. Перевірте файл або введіть операцію вручну.');
  }

  return [{ date, counterparty, amount, description: 'Розпізнано автоматично — перевірте дані' }];
};

const normalizeDate = (raw) => {
  const m = raw.match(DATE_RE);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return raw || new Date().toISOString().slice(0, 10);
};
