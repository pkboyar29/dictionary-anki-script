import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const mainCsvFile = fs.readFileSync(path.resolve('output/anki.csv'));
const mainCsvRecords = parse(mainCsvFile, {
  delimiter: ';',
});

const directoryPath = path.resolve('ai_result');
const fileNames = fs.readdirSync(directoryPath);
for (let i = 0; i < fileNames.length; i++) {
  const fileName = fileNames[i];

  const dashIndex = fileName.indexOf('-');
  if (dashIndex === -1) {
    continue;
  }
  const startIndex = Number(fileName.substring(0, dashIndex));
  const endIndex = Number(
    fileName.substring(dashIndex + 1, fileName.length - 4),
  );
  if (isNaN(startIndex) || isNaN(endIndex)) {
    continue;
  }

  const filePath = path.join(directoryPath.toString(), fileName);
  const file = fs.readFileSync(filePath);
  const batchRecords = parse(file, { delimiter: ';' });

  for (let j = startIndex; j < endIndex; j++) {
    const batchIndex = j - startIndex;
    const value = batchRecords[batchIndex];
    if (!value) {
      throw new Error('Batch size mismatch');
    }

    // сравнение слов на всякий случай
    if (mainCsvRecords[j][1] === value[0]) {
      mainCsvRecords[j][6] = value[1];
    }
  }
}

const csvString = stringify(mainCsvRecords, { delimiter: ';' });
const resultPath = path.resolve('output/anki.csv');
fs.writeFileSync(resultPath, csvString, 'utf-8');
