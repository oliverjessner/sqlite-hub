function stripLineComment(line = "") {
  const text = String(line);
  const commentIndex = text.indexOf("--");

  return commentIndex === -1 ? text : text.slice(0, commentIndex);
}

function stripLineComments(sql = "") {
  return String(sql).split(/\r?\n/).map(stripLineComment).join("\n");
}

function stripTrailingSemicolons(query = "") {
  const text = String(query).trim();
  let endIndex = text.length;

  while (endIndex > 0 && text[endIndex - 1] === ";") {
    endIndex -= 1;
  }

  return text.slice(0, endIndex);
}

module.exports = {
  stripLineComment,
  stripLineComments,
  stripTrailingSemicolons,
};
