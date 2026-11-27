const ordinal = '(?:第[\\d一二三四五六七八九十]+步\\s*[:：、.]?|\\d+[、.．)）](?!\\d)|[一二三四五六七八九十]+、)';
const leadingOrdinal = new RegExp('^' + ordinal + '\\s*');
const inlineOrdinal = /(?=第[\d一二三四五六七八九十]+步[:：、])|[ \t]+(?=\d+[、.．)）](?!\d)[ \t]+)/;

function splitSteps(text) {
  return text.split(/\r?\n/).flatMap((line) => line.trim().split(inlineOrdinal))
    .map((line) => line.trim().replace(leadingOrdinal, '')).filter(Boolean);
}

module.exports = { splitSteps };
