// showTags.js

const sources = matches
  .map(
    m => `- ${m.meta.source}, Tags: ${m.meta.exam_tags.join(", ")}, P.Num: ${m.meta.page}`
  )
  .join("\n");
