import fs from 'fs';
import path from 'path';

// TODO bug: не добавляет последнее слово

const partsOfSpeech = [
  'noun',
  'verb',
  'adjective',
  'phrase',
  'collocation',
  'phrasal verb',
  'adverb',
  'idiom',
  'contraction',
  'preposition',
  'union',
  'pronoun',
  'sentence',
];
const months = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  June: 5,
  July: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};
const numberedEntryRe = /^\d+\)/; // начинаем с цифры и закрывающей в конце скобки
const russianLetterEntryRe = /^[А-Яа-яЁё]\)/; // начинаем с одной буквы из русского алфавита и закрывающей в конце скобки
const translationAndMeaningRe = /\)\s*[—–-−-]\s*(.+)$/; // находим ), любые пробелы, любый тип тире/дефиса/минуса, любые пробелы, берем все до конца строки
const categories = [
  'food & cooking',
  'anatomy & health',
  'sport',
  'weather',
  'programming & it',
  'flora',
  'fauna',
  'auto',
  'economics',
  'none',
];

let category = process.argv[2];
if (!category || !categories.includes(category)) {
  category = 'none';
}

// находит все двойные кавычки и заменяют каждую на две кавычки
function escapeCsvQuotes(value) {
  if (value == null) return '';
  return `${value.replace(/"/g, '""')}`;
}

function toLocalISOString(date) {
  const pad = (n) => {
    return n.toString().padStart(2, '0');
  };

  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());

  return `${year}-${month}-${day}`;
}

function getDateFromLine(line) {
  let dateString = '';
  if (line[1] !== ' ') {
    dateString = line.substring(1);
  } else {
    dateString = line.substring(2);
  }

  const dateArray = dateString.split(' ');
  const date = Number(dateArray[0]); // автоматически преобразовывает строку типа 02 в нормальное число
  const month = months[dateArray[1]];
  const year = Number(dateArray[2]);

  return new Date(year, month, date, 0, 0, 0, 0);
}

// TODO: также добавить __ (тоже жирный текст)
function replaceMarkdownDelimiter(line, delimiter) {
  if (!['**', '*', '_'].includes(delimiter)) {
    throw new Error('markdown delimiter invalid format');
  }

  let newLine = '';
  let delimCounter = 0;
  let firstDelimPos = -1;
  let tagName = delimiter === '**' ? 'b' : 'i';

  const isDouble = delimiter.length === 2; // delimiter === **

  for (let i = 0; i < line.length; i++) {
    if (
      isDouble ? line[i] === '*' && line[i + 1] === '*' : line[i] === delimiter
    ) {
      delimCounter += 1;

      if (delimCounter === 1) {
        firstDelimPos = newLine.length;
      } else if (delimCounter === 2) {
        newLine =
          newLine.slice(0, firstDelimPos) +
          `<${tagName}>` +
          newLine.slice(firstDelimPos);
        newLine += `</${tagName}>`;

        delimCounter = 0;
        firstDelimPos = -1;
      }

      if (delimiter === '**') {
        i++; // пропускаем второй символ *
      }
    } else {
      newLine += line[i];
    }
  }

  if (delimCounter === 1 && firstDelimPos !== -1) {
    newLine =
      newLine.slice(0, firstDelimPos) +
      delimiter +
      newLine.slice(firstDelimPos);
  }

  return newLine;
}

function convertMarkdownToHTML(line) {
  const hasBoldDelimiter = line.includes('**');
  const hasItalicsDelimiter = line.includes('_');
  if (!hasBoldDelimiter && !hasItalicsDelimiter) {
    return line;
  }

  let newLine = line;
  if (hasBoldDelimiter) {
    newLine = replaceMarkdownDelimiter(line, '**');
  }
  if (hasItalicsDelimiter) {
    newLine = replaceMarkdownDelimiter(newLine, '_');
  }
  return newLine;
}

function removeMarkdownDelimiters(text) {
  return text.replace(/[*_]+/g, '');
}

function splitTranslationAndMeaning(markdownText) {
  const text = removeMarkdownDelimiters(markdownText);

  const parts = text.split(',').map((p) => p.trim());

  let translationParts = [];
  let meaningParts = [];

  let meaningStarted = false;

  for (const part of parts) {
    if (!meaningStarted && /^[А-Яа-яЁё]/.test(part)) {
      // проверяет, начинается ли с русской буквы
      translationParts.push(part);
    } else {
      meaningStarted = true;
      meaningParts.push(part);
    }
  }

  return {
    translation: translationParts.join(', '),
    meaning: meaningParts.join(', '),
  };
}

function createCsvLine(csvItem) {
  return (
    [
      toLocalISOString(csvItem.createdDate),
      `"${escapeCsvQuotes(csvItem.word)}"`,
      csvItem.partOfSpeech,
      `"${escapeCsvQuotes(csvItem.translation)}"`,
      `"${escapeCsvQuotes(csvItem.meaning)}"`,
      `"${escapeCsvQuotes(csvItem.comment)}"`,
      `${category === 'none' ? '' : category}`,
    ].join(';') + '\n'
  );
}

function getTextAfterClosingParenthesis(text) {
  return text.substring(text.indexOf(')') + 1);
}

// structure: createdDate | word | partOfSpeech | translation | meaning | comment | category
let csvString = '';

let unparsedWordsString = '';
let unparsedWordsCount = 0;

const inputPath = path.resolve('input/vocab.md');
const mdFile = fs.readFileSync(inputPath);
const mdFileString = mdFile.toString();
const mdFileLines = mdFileString.split(/\r?\n/).filter(Boolean);

const csvItem = {
  createdDate: new Date(),
  word: '',
  partOfSpeech: '',
  translation: '',
  meaning: '',
  comment: '',
};
let createdDate = new Date();
let startOfWordIdx = 0;

for (let i = 0; i < mdFileLines.length; i++) {
  const line = mdFileLines[i];

  if (line.startsWith('#')) {
    createdDate = getDateFromLine(line);

    continue;
  }

  try {
    if (numberedEntryRe.test(line)) {
      startOfWordIdx = i;

      if (csvItem.word !== '' && csvItem.partOfSpeech !== '') {
        csvString += createCsvLine(csvItem);

        csvItem.createdDate = new Date();
        csvItem.word = '';
        csvItem.partOfSpeech = '';
        csvItem.translation = '';
        csvItem.meaning = '';
        csvItem.comment = '';
      }

      const lineContent = getTextAfterClosingParenthesis(line);

      let word = lineContent.substring(0, lineContent.indexOf('(')).trimEnd();

      const partOfSpeech = lineContent.substring(
        lineContent.indexOf('(') + 1,
        lineContent.indexOf(')'),
      );
      if (!partsOfSpeech.includes(partOfSpeech)) {
        throw new Error('partOfSpeech');
      }

      if (
        (partOfSpeech === 'verb' || partOfSpeech === 'phrasal verb') &&
        word.startsWith('to')
      ) {
        word = word.slice(2).trimStart();
      }

      const match = lineContent.match(translationAndMeaningRe);
      const hasRussianEntry = russianLetterEntryRe.test(mdFileLines[i + 1]);
      // если нету перевода и нету на следующей строке варианта перевода || если есть перевод и есть варинат перевода на следующей строке
      if ((!match && !hasRussianEntry) || (match && hasRussianEntry)) {
        throw new Error('translationAndMeaning');
      }
      if (!match) {
        csvItem.createdDate = createdDate;
        csvItem.word = word;
        csvItem.partOfSpeech = partOfSpeech;
        continue;
      }

      const translationAndMeaning = match[1];
      const { translation, meaning } = splitTranslationAndMeaning(
        translationAndMeaning,
      );

      csvItem.createdDate = createdDate;
      csvItem.word = word;
      csvItem.partOfSpeech = partOfSpeech;
      csvItem.translation = translation;
      csvItem.meaning = meaning;
    } else if (russianLetterEntryRe.test(line)) {
      if (line[0] != 'А') {
        // второй или более вариант перевода
        csvString += createCsvLine(csvItem);

        csvItem.translation = '';
        csvItem.meaning = '';
        csvItem.comment = '';
      }

      const lineContent = getTextAfterClosingParenthesis(line);
      if (!lineContent) {
        throw new Error('translationAndMeaning');
      }
      const { translation, meaning } = splitTranslationAndMeaning(lineContent);

      csvItem.translation = translation;
      csvItem.meaning = meaning;
    } else {
      csvItem.comment += `${csvItem.comment ? '<br>' : ''}${convertMarkdownToHTML(line)}`;
    }
  } catch (e) {
    unparsedWordsCount += 1;

    const dateString = `# ${createdDate.getDate()} ${Object.keys(months)[createdDate.getMonth()]} ${createdDate.getFullYear()}`;
    if (!unparsedWordsString.includes(dateString)) {
      unparsedWordsString += `${dateString}\n`;
    }

    let startOfNextWordIdx = 0;
    for (let j = startOfWordIdx; j < mdFileLines.length; j++) {
      const line = mdFileLines[j];
      if (numberedEntryRe.test(line) && j !== startOfWordIdx) {
        startOfNextWordIdx = j;
        break;
      }

      unparsedWordsString += `${line}\n`;
    }
    i =
      startOfNextWordIdx === 0
        ? mdFileLines.length - 1
        : startOfNextWordIdx - 1;
  }
}

const resultPath = path.resolve('output/anki.csv');
fs.writeFileSync(resultPath, csvString, 'utf-8');

if (unparsedWordsCount > 0) {
  console.log(`There are ${unparsedWordsCount} unparsed words!`);
} else {
  console.log('Everything parsed successfully!');
}

const unparsedWordsPath = path.resolve('output/unparsed-words.md');
fs.writeFileSync(unparsedWordsPath, unparsedWordsString, 'utf-8');
