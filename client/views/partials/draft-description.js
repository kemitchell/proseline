module.exports = (draftOrBrief, { determiner }) => {
  const parents = draftOrBrief.parents || draftOrBrief.parents
  let text
  if (parents.length === 0) text = 'original draft'
  else if (parents.length === 1) text = 'revising draft'
  else text = 'combining draft'
  if (determiner) {
    if (text[0] === 'o') text = 'an ' + text
    else text = 'a ' + text
  }
  return document.createTextNode(text)
}
