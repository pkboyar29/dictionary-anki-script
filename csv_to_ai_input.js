import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';

const mainCsvFile = fs.readFileSync(path.resolve('output/anki.csv'));
const mainCsvRecords = parse(mainCsvFile, {
  delimiter: ';',
});

const batchesPath = path.resolve('batches');
fs.mkdirSync(batchesPath, { recursive: true });

const batchSize = 150;

let counter = 0;
while (true) {
  const prevCounter = counter;
  counter += batchSize;
  if (counter > mainCsvRecords.length) {
    counter = mainCsvRecords.length;
  }

  const startIndex = prevCounter;
  const endIndex = counter;

  const batch = mainCsvRecords.slice(startIndex, endIndex);
  const filteredBatch = batch.map((row) => [row[1], row[3]]);
  const batchCsvString = stringify(filteredBatch, { delimiter: ';' });
  const batchFileName = `${startIndex}-${endIndex}.csv`;
  fs.writeFileSync(
    path.join(batchesPath.toString(), batchFileName),
    batchCsvString,
    'utf-8',
  );

  if (counter === mainCsvRecords.length) {
    break;
  }
}
